import DefaultTheme from 'vitepress/theme';
import { useRoute, withBase } from 'vitepress';
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client';
import { createApp, defineAsyncComponent, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue';
import './custom.css';

const OpenapiTheme = defineAsyncComponent(async () => {
    const [openapi, { default: spec }] = await Promise.all([
        import('vitepress-openapi/client'),
        import('../data/openapi.json', { with: { type: 'json' } }),
    ]);

    return defineComponent({
        setup() {
            const route = useRoute();
            const mountPoint = ref(null);
            let openapiApp;

            onMounted(() => {
                if (!document.querySelector('link[data-streamient-openapi-style]')) {
                    const stylesheet = document.createElement('link');
                    stylesheet.rel = 'stylesheet';
                    stylesheet.href = withBase('/vitepress-openapi.css');
                    stylesheet.dataset.streamientOpenapiStyle = '';
                    document.head.append(stylesheet);
                }
                openapi.useOpenapi({ spec });
                openapi.useTheme({
                    markdown: {
                        config: (md) => {
                            md.set({ breaks: false });
                            return md;
                        },
                    },
                });

                openapiApp = createApp({
                    setup() {
                        return () => {
                            const operationId = route.data.params?.operationId;
                            const operationPage = Boolean(operationId);
                            const component = operationPage ? openapi.OAOperation : openapi.OASpec;
                            return h(component, operationPage ? { operationId } : {});
                        };
                    },
                });
                openapi.theme.enhanceApp({ app: openapiApp });
                openapiApp.mount(mountPoint.value);
            });

            onBeforeUnmount(() => openapiApp?.unmount());

            return () => h('div', { ref: mountPoint });
        },
    });
});

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component('StreamientOpenapi', OpenapiTheme);
        enhanceAppWithTabs(app);
    },
};
