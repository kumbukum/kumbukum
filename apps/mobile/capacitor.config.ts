import type { CapacitorConfig } from "@capacitor/cli";

const enableLocalServer = process.env.VITE_ENABLE_LOCAL_SERVER === "true";

const config: CapacitorConfig = {
	appId: "com.streamient.mobile",
	appName: "Streamient",
	webDir: "dist",
	zoomEnabled: true,
	plugins: {
		CapacitorHttp: { enabled: true },
		CapacitorShareTarget: { appGroupId: "group.com.streamient.mobile" },
	},
	android: { allowMixedContent: enableLocalServer },
	server: { androidScheme: "https", cleartext: enableLocalServer },
};

export default config;
