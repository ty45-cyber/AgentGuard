const tools = [
  { id:'github-read', name:'github.read_repo', publisher:'Acme / GitHub Adapter', version:'1.4.2', digest:'sha256:8fa2…31d2', risk:'low', decision:'allow', permissions:['read:repo','read:issues'], resources:['repo:acme/payments','repo:acme/platform'], caps:['read repository','read issues'] },
  { id:'filesystem-read', name:'filesystem.read', publisher:'Internal Tools', version:'2.1.0', digest:'sha256:51d0…9a4e', risk:'high', decision:'review', permissions:['read:file'], resources:['workspace:/app/**','workspace:/app/.env'], caps:['read workspace'] },
  { id:'shell-execute', name:'shell.execute', publisher:'Internal Tools', version:'1.8.3', digest:'sha256:d22e…a8a1', risk:'critical', decision:'block', permissions:['exec:shell'], resources:['host:*'], caps:['execute shell commands'] },
  { id:'slack-send', name:'slack.send', publisher:'Acme / Slack Adapter', version:'3.0.1', digest:'sha256:ad81…7bce', risk:'high', decision:'review', permissions:['write:slack'], resources:['channel:support-*'], caps:['send messages'] },
  { id:'postgres-query', name:'postgres.query', publisher:'Acme Data Platform', version:'1.3.6', digest:'sha256:1dc2…a909', risk:'medium', decision:'review', permissions:['read:db'], resources:['db:reporting'], caps:['read database'] },
];
const baseline = JSON.parse(JSON.stringify(tools[0]));
let selected = 'github-read';
let drift = false;
let remediated = false;

const $ = (id) => document.getElementById(id);
const severityClass = (risk) => risk === 'critical' ? 'critical' : risk === 'high' ? 'high' : risk === 'medium' ? 'medium' : 'low';
const labelStatus = (t, isDrift) => isDrift ? 'BLOCKED' : t.decision === 'review' ? 'REVIEW' : t.decision === 'block' ? 'BLOCKED' : 'APPROVED';

function renderList(){
  $('toolList').innerHTML = tools.map(t => {
    const isDrift = drift && !remediated && t.id === 'github-read';
    const risk = isDrift ? 'critical' : t.risk;
    const decision = isDrift ? 'block' : t.decision;
    return `<button class="tool-row ${t.id===selected?'selected':''}" data-tool="${t.id}">
      <div class="tool-icon">${t.name.startsWith('github')?'GH':t.name.startsWith('filesystem')?'FS':t.name.startsWith('shell')?'$':t.name.startsWith('slack')?'SL':'DB'}</div>
      <div class="tool-main"><b>${t.name}</b><span>${t.publisher}</span></div>
      <span class="sev ${severityClass(risk)}">${risk}</span><em class="decision ${decision}">${decision}</em>
    </button>`;
  }).join('');
  document.querySelectorAll('.tool-row').forEach(btn => btn.addEventListener('click', () => { selected = btn.dataset.tool; render(); }));
}

function getSelected(){ return tools.find(t => t.id === selected) || tools[0]; }

function render(){
  const t = getSelected();
  const isDrift = drift && !remediated && t.id === 'github-read';
  $('toolTitle').textContent = t.name;
  $('statusPill').textContent = labelStatus(t, isDrift);
  $('statusPill').className = `status-pill ${isDrift ? 'blocked' : t.decision==='review' ? 'review' : t.decision==='block' ? 'blocked' : 'approved'}`;
  $('requestBox').className = `request-box ${isDrift ? 'alert' : ''}`;
  $('requestBox').innerHTML = `<div><span>Developer request</span><b>Add a GitHub agent tool for repository analysis</b></div><em>${isDrift ? 'Capability drift detected' : remediated ? 'Re-approved after remediation' : 'Baseline approved'}</em>`;
  $('passport').innerHTML = [['Publisher',t.publisher],['Version',isDrift?'1.5.0':t.version],['Owner',t.id==='filesystem-read'?'Customer Operations':'Platform Engineering'],['Digest',isDrift?'sha256:f921…8ac0':t.digest]].map(([a,b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  const caps = isDrift ? [...baseline.caps,'write repository','delete branch','network access'] : t.caps;
  $('caps').innerHTML = caps.map(c => `<span class="cap ${isDrift && ['write repository','delete branch','network access'].includes(c)?'danger':''}">${c}</span>`).join('');

  if (isDrift){
    $('findingArea').innerHTML = `<div class="drift">
      <div class="drift-head"><strong>!</strong><div><b>Approved capability set changed</b><span>The tool is no longer equivalent to what security approved.</span></div></div>
      <div class="diff">${[['capabilities','read repository, read issues','+ write repository','high'],['capabilities','read repository, read issues','+ delete branch','critical'],['resources','named repositories','+ network:*','high'],['digest','sha256:8fa2…31d2','sha256:f921…8ac0','high']].map(r => `<div><span>${r[0]}</span><del>${r[1]}</del><b class="${r[3]}">${r[2]}</b></div>`).join('')}</div>
      <div class="policy"><span>Policy decision</span><b>BLOCK</b><small>Write + destructive capabilities and scope expansion require a new approval.</small></div>
    </div>`;
    $('actionBtn').textContent = 'Remediate & re-approve';
    $('actionBtn').className = 'btn primary';
  } else {
    const ok = t.decision==='allow';
    $('findingArea').innerHTML = `<div class="${ok?'clean':'review-callout'}"><strong>${ok?'✓':'△'}</strong><div><b>${ok?'Trust boundary intact':'Review required'}</b><span>${ok?'Current capabilities match the signed baseline.':'The current tool exceeds the low-risk baseline and needs explicit approval.'}</span></div></div>`;
    $('actionBtn').textContent = 'Simulate capability drift';
    $('actionBtn').className = 'btn secondary';
  }

  $('explanation').className='explanation hidden'; $('explanation').innerHTML='';
  $('evidenceGrid').innerHTML = [
    ['Identity', t.name],
    ['Baseline', `v1`],
    ['Policy', labelStatus(t, isDrift), isDrift ? 'critical' : ''],
    ['Decision source', 'Deterministic rules'],
    ['AI role', 'Explain + remediate'],
    ['Approval', isDrift ? 'Invalidated' : 'Recorded'],
  ].map(([a,b,c='']) => `<div class="evidence-item"><span>${a}</span><b class="${c}">${b}</b></div>`).join('');
  const critical = tools.filter(t => t.risk==='critical').length + (isDrift ? 1 : 0);
  $('criticalCount').textContent = critical;
  $('reviewCount').textContent = tools.filter(t => t.decision==='review').length;
  $('findingCount').textContent = critical + tools.filter(t => t.decision==='review').length;
  renderList();
}

function startDrift(){ selected='github-read'; drift=true; remediated=false; render(); }
function remediate(){ remediated=true; render(); $('explanation').className='explanation'; $('explanation').innerHTML='<div><span>Decision context</span><b>Evidence-bound fallback</b></div><p>The remediation removes the added write, destructive and unrestricted-network authority. The original capability passport is restored and ready for re-approval.</p>'; }
function action(){ drift && !remediated ? remediate() : startDrift(); }
function explain(){
  const t = getSelected();
  const isDrift = drift && !remediated && t.id==='github-read';
  const text = isDrift
    ? 'The tool is blocked because the current capability set no longer matches the approved passport. Repository write and branch deletion expand authority, while unrestricted network access expands the reachable environment. Restore the smallest required scope, then re-scan and re-approve.'
    : (t.decision==='allow' ? 'The tool remains inside its approved trust boundary. Its declared permissions and reachable resources match the stored baseline, so the deterministic policy engine allows it.' : 'This tool requires review because its permissions or resource scope exceed the low-risk baseline. Narrow its reachable resources and require explicit approval for the capability.');
  $('explanation').className='explanation'; $('explanation').innerHTML=`<div><span>Decision context</span><b>Evidence-bound fallback</b></div><p>${text}</p>`;
}
function exportEvidence(){
  const t=getSelected(); const isDrift=drift && !remediated && t.id==='github-read';
  const payload={product:'AgentGuard',purpose:'AI-assisted development trust control',generatedAt:new Date().toISOString(),decision:labelStatus(t,isDrift),tool:t,approvedManifest:{version:1,capabilities:baseline.caps,permissions:baseline.permissions,resources:baseline.resources,digest:baseline.digest,owner:'Platform Engineering',approver:'Security Engineering'},capabilityChanges:isDrift?[['write repository'],['delete branch'],['network:*'],['digest change']]:[],policy:{deterministic:true,rules:['AG-001 shell execution is blocked','AG-002 wildcard / credential scope requires block or review','AG-003 writes require explicit approval','AG-004 destructive capabilities are blocked by default']},bobWorkflow:['Plan','Security Reviewer','Capability Audit','Capability Diff','Evidence','Verify / Rollback']};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`agentguard-change-passport-${t.id}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

$('driftBtn').addEventListener('click', startDrift);
$('actionBtn').addEventListener('click', action);
$('explainBtn').addEventListener('click', explain);
$('exportBtn').addEventListener('click', exportEvidence);
$('exportBtn2').addEventListener('click', exportEvidence);
$('scanBtn').addEventListener('click', () => { $('scanBtn').disabled=true; $('scanBtn').querySelector('span').textContent='Scanning…'; setTimeout(()=>{ $('scanBtn').disabled=false; $('scanBtn').querySelector('span').textContent='Scan complete'; setTimeout(()=>{$('scanBtn').querySelector('span').textContent='Scan workspace'},1500); },700); });
render();
