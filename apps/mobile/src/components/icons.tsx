import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';

import { colors } from '@cheque-flow/ui/tokens';

/**
 * The app's icons.
 *
 * Emoji used to stand in for these. They are font-dependent — the same glyph is
 * a different drawing on iOS, Android and every OS version — they cannot take a
 * colour from a design token, and a screen reader reads "house with garden"
 * where the interface means "home". A vector set fixes all three.
 *
 * Feather because it is the closest match to the web app's own inline SVGs:
 * one stroke weight, rounded caps, no fills. The two platforms should not look
 * like two products.
 *
 * `@expo/vector-icons` ships inside Expo Go, so this adds nothing to install
 * and cannot break the SDK ceiling the way a new native module would.
 *
 * The names mirror `apps/web/components/icons.tsx` on purpose: a screen ported
 * between platforms should not have to rename its icons.
 */

type FeatherName = ComponentProps<typeof Feather>['name'];

export interface IconProps {
  size?: number;
  color?: string;
  /**
   * Decorative icons sit beside their own label and are hidden from the
   * screen reader; a standalone one must be given a name by its caller.
   */
  label?: string;
}

function make(name: FeatherName) {
  return function IconComponent({ size = 22, color = colors.text, label }: IconProps) {
    return (
      <Feather
        name={name}
        size={size}
        color={color}
        accessibilityRole={label ? 'image' : undefined}
        accessibilityLabel={label}
        accessibilityElementsHidden={!label}
        importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      />
    );
  };
}

export const IconDashboard = make('grid');
export const IconCheque = make('file-text');
export const IconSearch = make('search');
export const IconCalendar = make('calendar');
export const IconReturn = make('corner-up-left');
export const IconContacts = make('users');
export const IconBranch = make('home');
export const IconReports = make('bar-chart-2');
export const IconUsers = make('user-check');
export const IconSettings = make('settings');
export const IconSafe = make('archive');
export const IconShield = make('shield');
export const IconCamera = make('camera');
export const IconPlus = make('plus');
export const IconBell = make('bell');
export const IconWallet = make('credit-card');
export const IconClipboard = make('clipboard');
export const IconAlert = make('alert-circle');
export const IconClock = make('clock');
export const IconUser = make('user');
export const IconMenu = make('menu');
export const IconClose = make('x');
export const IconLogout = make('log-out');
export const IconCheck = make('check-circle');
export const IconChevronEnd = make('chevron-left');
export const IconEdit = make('edit-2');
export const IconTrash = make('trash-2');
export const IconSend = make('send');
export const IconDownload = make('download');
export const IconRefresh = make('refresh-cw');
export const IconFilter = make('sliders');
export const IconArrowIn = make('arrow-down-left');
export const IconArrowOut = make('arrow-up-right');
export const IconPhone = make('phone');
export const IconMessage = make('message-circle');
export const IconEye = make('eye');
export const IconEyeOff = make('eye-off');
export const IconLock = make('lock');
