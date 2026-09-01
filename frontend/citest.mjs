const B = 'http://localhost:4000';
const j = async (p, o) => { const r = await fetch(B + p, o); let b = null; try { b = await r.json(); } catch (_) {} return { s: r.status, b }; };
const ph = () => '69' + Math.floor(Math.random() * 1e8);
let rA = null, rB = null;
for (let i = 0; i < 3; i++) { rA = await j('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CkA', phone: ph(), password: 'secret12345' }) }); if (rA.s !== 429) break; await new Promise(r => setTimeout(r, 61000)); }
for (let i = 0; i < 3; i++) { rB = await j('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CkB', phone: ph(), password: 'secret12345' }) }); if (rB.s !== 429) break; await new Promise(r => setTimeout(r, 61000)); }
const hA = { authorization: `Bearer ${rA.b.token}`, 'content-type': 'application/json' };
const dm = await j('/api/chats/direct/' + rB.b.user.id, { method: 'POST', headers: hA, body: '{}' });
const chatId = (dm.b.chat || dm.b).id;
// seed two history rows directly via API (POST) + one via config
await j('/api/calls', { method: 'POST', headers: hA, body: JSON.stringify({ chatId, kind: 'voice', status: 'ended', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationSec: 42 }) });
await j('/api/calls', { method: 'POST', headers: hA, body: JSON.stringify({ chatId, kind: 'video', status: 'missed', startedAt: new Date().toISOString() }) });
const get = await j('/api/calls', { headers: hA });
const calls = get.b.calls;
console.log('GET count:', calls.length, '| peer info present:', calls.every(c => typeof c.peer_id === 'number' && !!c.peer_name), '| peer:', calls[0].peer_name, '| dur:', calls[0].duration_sec);
const one = calls[0];
const del1 = await j('/api/calls/' + one.id, { method: 'DELETE', headers: hA });
const get2 = await j('/api/calls', { headers: hA });
const delAll = await j('/api/calls', { method: 'DELETE', headers: hA });
const get3 = await j('/api/calls', { headers: hA });
console.log('DEL single:', del1.s, '| after:', get2.b.calls.length, '| DEL all:', delAll.b.deleted, '| final:', get3.b.calls.length);
console.log('users:', JSON.stringify((await j('/api/users?n=1', { headers: hA })).b));
