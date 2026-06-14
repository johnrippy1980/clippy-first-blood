// electron-builder afterSign hook: notarize the macOS app — but ONLY when Apple
// credentials are present in the environment. With no creds (every local build
// today, and CI before you add the secrets) this is a clean no-op, so the
// ad-hoc unsigned build keeps working exactly as before.
//
// Enable by setting these env vars (in CI: GitHub Actions secrets):
//   APPLE_ID                       your Apple Developer account email
//   APPLE_APP_SPECIFIC_PASSWORD    app-specific password from appleid.apple.com
//   APPLE_TEAM_ID                  10-char team id (Developer portal → Membership)
//
// Signing itself (the Developer ID Application cert) is driven separately by
// electron-builder's CSC_LINK / CSC_KEY_PASSWORD. Notarization only runs after
// a real signature exists, so this hook also bails if the build was ad-hoc.

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') return;

    const appleId = process.env.APPLE_ID;
    const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (!appleId || !appleIdPassword || !teamId) {
        console.log('[notarize] APPLE_* creds not set — skipping (ad-hoc build).');
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = `${appOutDir}/${appName}.app`;
    console.log(`[notarize] submitting ${appName}.app to Apple…`);

    await notarize({
        appBundleId: context.packager.appInfo.id,
        appPath,
        appleId,
        appleIdPassword,
        teamId,
    });
    console.log(`[notarize] ${appName}.app notarized + ready to staple.`);
};
