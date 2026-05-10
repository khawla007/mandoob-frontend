import { z } from 'zod';

export const employeeNotificationPreferencesSchema = z.object({
  renewal_reminders_enabled: z.boolean(),
});

export type EmployeeNotificationPreferencesInput = z.infer<
  typeof employeeNotificationPreferencesSchema
>;
