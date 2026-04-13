import DefaultTheme from 'vitepress/theme';
import { theme, useOpenapi } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import spec from '../data/openapi.json' with { type: 'json' };

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        useOpenapi({ spec });
        theme.enhanceApp({ app });
    },
};
