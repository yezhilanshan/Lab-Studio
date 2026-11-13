import catalog from '../../local-catalog.json';
import stats from '../../catalog-stats.json';
import {maskPath} from '../../../lib/display-path';

export const dynamic = 'force-dynamic';

const records = (catalog as Record<string, unknown>[]).map((record) => ({
  ...record,
  sourcePath: maskPath(record.sourcePath),
  notes: maskPath(record.notes),
}));

export async function GET(req: Request) {
  const headers = {'Cache-Control': 'private, max-age=300'};
  if (new URL(req.url).searchParams.get('download') === '1') {
    return new Response(JSON.stringify({stats: {...stats, directory: '本地论文目录'}, records}, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="local-paper-catalog.json"',
      },
    });
  }
  return Response.json(records, {headers});
}
