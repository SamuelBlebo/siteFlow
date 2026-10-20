import { COLORS, DEFAULT_SKIN, RADIUS, SKINS, SPACE, TOUCH_MIN, isSkin } from '@siteflow/shared';

// The shared design tokens (packages/shared/src/design.ts), the same ones the web app uses.
// colors.brass, brassInk and brassSoft are the person's skin (accent): applySkin swaps them, and
// screens pick the new accent up as they draw. Styles that use the accent are set inline for that reason.
export const colors = { ...COLORS };
export const space = SPACE;
export const radius = RADIUS;
export const touchMin = TOUCH_MIN;

export function applySkin(skin) {
  Object.assign(colors, SKINS[isSkin(skin) ? skin : DEFAULT_SKIN].light);
}
