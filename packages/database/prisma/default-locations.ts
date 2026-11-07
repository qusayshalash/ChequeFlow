import { LocationType } from '@cheque-flow/shared-types';

/**
 * Where a cheque can be kept. Receiving a cheque requires one and no screen
 * creates them, so an organization without these cannot move a cheque past
 * DRAFT. Shared by the development seed and the production bootstrap.
 */
export const DEFAULT_LOCATIONS = [
  { type: LocationType.SAFE, name: 'الخزنة الرئيسية', description: 'خزنة الإدارة المالية' },
  { type: LocationType.DRAWER, name: 'درج الصندوق', description: 'درج أمين الصندوق' },
  { type: LocationType.BANK, name: 'إيداع بنكي', description: 'شيكات مودعة في البنك' },
  { type: LocationType.EXTERNAL, name: 'خارج الشركة', description: 'بحوزة جهة خارجية' },
] as const;
