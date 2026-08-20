import { report, untotalledKindTables } from './lib/sectionKind';

for (const line of report(untotalledKindTables())) console.log(line);
