import { validateClientEnvironment } from './environment.js';

export const environment = validateClientEnvironment(import.meta.env);
