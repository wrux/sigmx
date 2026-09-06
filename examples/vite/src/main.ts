import './style.css';
import { plugins, report } from 'virtual:sigmx-plugins';
import { createSigmx } from 'sigmx';

const app = createSigmx({ plugins });
console.info('sigmx auto mode registered:', Object.keys(report.reasons).join(', '));
(window as any).sigmx = app;
