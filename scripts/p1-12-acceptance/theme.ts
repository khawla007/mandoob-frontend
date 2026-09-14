export type P112ThemeRoles = {
  canvas: string;
  surface: string;
  elevated: string;
  text: string;
  muted: string;
  tint: string;
  body: string;
};

export type P112ThemeStyle = {
  identity: string;
  background: string;
  color: string;
};

export function findP112ThemeRoleMismatches(
  currentRoles: P112ThemeRoles,
  oppositeRoles: P112ThemeRoles,
  currentStyles: readonly P112ThemeStyle[],
  oppositeStyles: readonly P112ThemeStyle[],
): string[] {
  if (currentStyles.length !== oppositeStyles.length) {
    throw new Error('P1.12 theme snapshot shape rejected');
  }
  const mismatches: string[] = [];
  currentStyles.forEach((current, index) => {
    const opposite = oppositeStyles[index];
    if (!opposite || opposite.identity !== current.identity) {
      throw new Error('P1.12 theme snapshot identity rejected');
    }
    for (const property of ['background', 'color'] as const) {
      const roleNames: (keyof P112ThemeRoles)[] =
        property === 'background'
          ? ['canvas', 'surface', 'elevated', 'tint']
          : ['text', 'muted', 'body'];
      const roles = roleNames.filter((role) => currentRoles[role] === current[property]);
      if (
        roles.length > 0 &&
        !roleNames.some((role) => oppositeRoles[role] === opposite[property])
      ) {
        mismatches.push(`${current.identity}:${property}`);
      }
    }
  });
  return mismatches;
}
