// Older audit entries were written as "Name (Super Admin · email)". Customers just see "InventaHQ Support".
export const cleanUserName = (n: string | null | undefined): string | null =>
  n ? (/\(Super Admin\s*·[^)]*\)/.test(n) ? 'InventaHQ Support' : n) : null
