type VisibleCompany = {
  currentProName: string | null;
  companyStatus: string;
};

export function summarizeVisibleCompanies(rows: VisibleCompany[]) {
  return rows.reduce(
    (summary, row) => {
      summary.visible += 1;
      if (row.currentProName) summary.assigned += 1;
      else summary.unassigned += 1;
      if (row.companyStatus !== 'active') summary.lifecycleAttention += 1;
      return summary;
    },
    { visible: 0, assigned: 0, unassigned: 0, lifecycleAttention: 0 },
  );
}
