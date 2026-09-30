'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const file = path.resolve(__dirname,'..',process.env.DB_FILE || 'server/storage/xundian.sqlite');
const db = new DatabaseSync(file);
try {
  const [action, id] = process.argv.slice(2);
  if (action === 'list') {
    for (const r of db.prepare("SELECT id,created_at,body FROM trades WHERE status='pending' ORDER BY created_at").all()) console.log(JSON.stringify({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.body) }));
  } else if (['approve','reject'].includes(action) && id) {
    const result = db.prepare("UPDATE trades SET status=? WHERE id=? AND status='pending'").run(action === 'approve' ? 'approved' : 'rejected',id);
    if (result.changes !== 1) throw new Error('未找到待审核信息');
    console.log('审核完成：' + id);
  } else throw new Error('用法：node --env-file-if-exists=.env scripts/review-trade.cjs list|approve ID|reject ID');
} catch(e) { console.error(e.message); process.exitCode = 1; } finally { db.close(); }
