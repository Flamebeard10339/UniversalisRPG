import { report, untotalledKindTables } from './lib/sectionKind';

const found = untotalledKindTables();

for (const line of report(found.tables, found.examined)) console.log(line);
