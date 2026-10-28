// The modifier key shortcuts use: Cmd on macOS, Ctrl elsewhere. The editors already map their shortcuts this way;
// this is for the hints shown to the user.
const platform = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform;

export const IS_MAC = /mac|iphone|ipad/i.test(platform);
export const MOD = IS_MAC ? 'Cmd' : 'Ctrl';
