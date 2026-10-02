// One config, two environments. APP_ENV is set per build profile in eas.json.
// Firebase files come from EAS "file" environment variables in the cloud, or from local files
// in this folder when you build on your machine (node scripts/fetch-firebase-config.mjs dev|prod):
//   development -> siteflow-dev-gh, production -> siteflow-prod-gh
const IS_PROD = process.env.APP_ENV === 'production';
const ENV = IS_PROD ? 'prod' : 'dev';

module.exports = {
  expo: {
    name: IS_PROD ? 'SiteFlow' : 'SiteFlow Dev',
    slug: 'siteflow',
    scheme: 'siteflow',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0F1D27' },
    ios: {
      bundleIdentifier: IS_PROD ? 'com.digitalprime.siteflow' : 'com.digitalprime.siteflow.dev',
      buildNumber: '1',
      supportsTablet: false,
      googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? `./GoogleService-Info.${ENV}.plist`,
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: IS_PROD ? 'com.digitalprime.siteflow' : 'com.digitalprime.siteflow.dev',
      versionCode: 1,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? `./google-services.${ENV}.json`,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0F1D27' },
    },
    plugins: [
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
      ['expo-image-picker', {
        cameraPermission: 'SiteFlow uses the camera to take site photos for daily reports.',
        photosPermission: 'SiteFlow lets you attach site photos to daily reports.',
      }],
    ],
    extra: { appEnv: process.env.APP_ENV ?? 'development', eas: { projectId: process.env.EAS_PROJECT_ID } },
    runtimeVersion: { policy: 'appVersion' },
  },
};
