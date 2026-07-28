import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { app } from 'electron';
import {
  PROTOCOL_VERSION,
  isRpcFailure,
  type HealthResult,
  type GameInstallation,
  type GameProcessState,
  type GameValidationResult,
  type LaunchGameInput,
  type CopyConveneUrlResult,
  type RpcRequest,
  type RpcResponse,
} from '@wwbox/contracts';

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timeout: NodeJS.Timeout;
}

interface HelperConveneUrlResult extends Omit<CopyConveneUrlResult, 'copiedAt'> {
  url: string | null;
  lastModifiedAt: string | null;
}

export class HelperClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private buffer = '';
  private lastStandardError = '';

  async health(): Promise<HealthResult> {
    const result = await this.invoke<HealthResult>('system.health', {});
    if (result.protocolVersion !== PROTOCOL_VERSION) throw new Error('UNSUPPORTED_PROTOCOL');
    return result;
  }

  detectGameInstallations(): Promise<GameInstallation[]> {
    return this.invoke<GameInstallation[]>('game.detectInstallations', {});
  }

  validateGameInstallation(rootPath: string): Promise<GameValidationResult> {
    return this.invoke<GameValidationResult>('game.validateInstallation', { rootPath });
  }

  launchGame(input: LaunchGameInput): Promise<GameProcessState> {
    return this.invoke<GameProcessState>('game.launch', input);
  }

  getGameProcessState(rootPath: string): Promise<GameProcessState> {
    return this.invoke<GameProcessState>('game.getProcessState', { rootPath });
  }

  stopAllGames(): Promise<number> {
    return this.invoke<number>('game.stopAll', {});
  }

  findConveneUrl(rootPath: string): Promise<HelperConveneUrlResult> {
    return this.invoke<HelperConveneUrlResult>('gacha.findConveneUrl', { rootPath });
  }

  dispose(): void {
    this.process?.kill();
    this.process = null;
    this.rejectAll(new Error('HELPER_UNAVAILABLE'));
  }

  private async invoke<TResult>(method: string, params: unknown): Promise<TResult> {
    const child = this.ensureProcess();
    const id = randomUUID();
    const request: RpcRequest = {
      jsonrpc: '2.0',
      protocolVersion: PROTOCOL_VERSION,
      id,
      method,
      params,
    };

    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('HELPER_TIMEOUT'));
      }, 5_000);
      this.pending.set(id, { resolve: (value) => resolve(value as TResult), reject, timeout });
      child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) return this.process;

    const executable = this.resolveExecutable();
    this.process = spawn(executable.command, executable.args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.process.stderr.setEncoding('utf8');
    this.process.stderr.on('data', (chunk: string) => {
      this.lastStandardError = `${this.lastStandardError}${chunk}`.slice(-1_000);
    });
    this.process.on('error', (error) => {
      this.rejectAll(new Error(`HELPER_START_FAILED: ${error.message}`));
    });
    this.process.on('exit', () => {
      this.process = null;
      const details = this.lastStandardError.trim();
      this.rejectAll(new Error(details ? `HELPER_EXITED: ${details}` : 'HELPER_EXITED'));
    });
    return this.process;
  }

  private resolveExecutable(): { command: string; args: string[] } {
    const override = process.env['WWBOX_HELPER_PATH'];
    if (override) return { command: override, args: [] };

    const packaged = join(process.resourcesPath, 'helper', 'WutheringWavesBox.Helper.exe');
    if (app.isPackaged && existsSync(packaged)) return { command: packaged, args: [] };

    const roots = [
      join(app.getAppPath(), '..', '..'),
      join(process.cwd(), '..', '..'),
      process.cwd(),
    ];
    const root = roots.find((candidate) =>
      existsSync(join(candidate, 'native', 'WutheringWavesBox.Helper')),
    );
    if (!root) throw new Error('HELPER_PROJECT_NOT_FOUND');

    const helperDirectory = join(root, 'native', 'WutheringWavesBox.Helper');
    const project = join(helperDirectory, 'WutheringWavesBox.Helper.csproj');
    const programFiles = process.env['ProgramFiles'];
    const installedDotnet = programFiles ? join(programFiles, 'dotnet', 'dotnet.exe') : '';
    const dotnet = installedDotnet && existsSync(installedDotnet) ? installedDotnet : 'dotnet';
    return { command: dotnet, args: ['run', '--project', project, '--no-launch-profile'] };
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      this.onMessage(line);
    }
  }

  private onMessage(line: string): void {
    let response: RpcResponse;
    try {
      response = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }
    if (!response.id) return;
    const request = this.pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timeout);
    this.pending.delete(response.id);
    if (isRpcFailure(response)) request.reject(new Error(response.error.code));
    else request.resolve(response.result);
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
