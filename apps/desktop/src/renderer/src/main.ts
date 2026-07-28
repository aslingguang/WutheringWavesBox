import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import './theme-system.css';
import './gacha-overlays.css';
import { installPreciseEditFieldInteractions } from './precise-edit-fields';

installPreciseEditFieldInteractions();
createApp(App).mount('#app');
