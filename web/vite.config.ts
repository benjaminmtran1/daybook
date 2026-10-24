import { defineConfig } from 'vite';
import {daybookBasePath} from './build-base';
export default defineConfig({base:daybookBasePath(process.env.DAYBOOK_BASE_PATH),css:{postcss:{plugins:[]}},build:{outDir:'../docs',emptyOutDir:true}});
