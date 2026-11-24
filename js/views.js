/* SEEON Lab 목업 — 실험 실행 · 실행 결과 · 결과 비교 · 모델/서버 상태 · 소개. 숫자는 모두 가짜 값(같은 숫자를 되풀이한 꼴)이다. */
(function () {
  'use strict';
  const LAB = window.LAB;
  const { S, t, esc, $, mmss, MODELS, QUANTS, modelName, quantName, catName, typeName } = LAB;
  const fk = (v, d) => `<span class="fake num">${typeof v === 'number' && d != null ? v.toFixed(d) : v}</span>`;

  const EXP = {
    E1: { name: ['E1 탐지 성능', 'E1 Detection'], desc: ['문항을 판단 LLM에 넣어 정밀도 · 재현율 · F1을 잽니다.', 'Feeds items to the judge LLM and measures precision, recall and F1.'] },
    E2: { name: ['E2 해설 생성', 'E2 Description generation'], desc: ['클립을 처리해 해설이 들어간 음성(조건 S)을 만들고 처리 지표를 남깁니다.', 'Processes clips into audio with descriptions (condition S) and records processing metrics.'] },
    E6: { name: ['E6 실시간성', 'E6 Real-time capacity'], desc: ['E2에서 남긴 요청 기록을 동시 사용자 N명분으로 다시 보내 지연을 잽니다.', 'Replays the requests recorded in E2 for N concurrent users and measures latency.'] },
  };
  const DBS = {
    'det-dev': ['탐지 개발용 · 3,600문항', 'Detection dev · 3,600 items'],
    'det-rep': ['탐지 보고용 · 준비 중', 'Detection report · in preparation'],
    'comp': ['이해도 DB · 48클립(구성 확정 중)', 'Comprehension DB · 48 clips (being finalized)'],
  };
  const expName = (e) => t(EXP[e].name[0], EXP[e].name[1]);
  const dbName = (d) => t(DBS[d][0], DBS[d][1]);

  // 끝난 실행(가짜)
  const RUNS = [
    { id: 'R-0007', exp: 'E1', judge: 'g26', quant: '16', db: 'det-dev', f1: 99.9, lat: 0.99, p95: 1.11, mem: 55.5, at: '11-24 09:11', took: '22:22' },
    { id: 'R-0008', exp: 'E1', judge: 'g26', quant: '8', db: 'det-dev', f1: 88.8, lat: 0.66, p95: 0.88, mem: 33.3, at: '11-24 09:44', took: '11:11' },
    { id: 'R-0009', exp: 'E1', judge: 'g26', quant: '4', db: 'det-dev', f1: 77.7, lat: 0.44, p95: 0.66, mem: 22.2, at: '11-24 10:11', took: '11:11', base: true },
    { id: 'R-0010', exp: 'E1', judge: 'g12', quant: '4', db: 'det-dev', f1: 66.6, lat: 0.33, p95: 0.55, mem: 11.1, at: '11-24 10:33', took: '9:99' },
    { id: 'R-0011', exp: 'E1', judge: 'ge4', quant: '4', db: 'det-dev', f1: 44.4, lat: 0.22, p95: 0.33, mem: 5.5, at: '11-24 10:55', took: '7:77' },
    { id: 'R-0012', exp: 'E1', judge: 'ge2', quant: '4', db: 'det-dev', f1: 33.3, lat: 0.11, p95: 0.22, mem: 3.3, at: '11-24 11:11', took: '5:55' },
    { id: 'R-0013', exp: 'E1', judge: 'ft4', quant: '4', db: 'det-dev', f1: 55.5, lat: 0.22, p95: 0.33, mem: 5.5, at: '11-24 11:33', took: '7:77' },
    { id: 'R-0003', exp: 'E2', judge: 'g26', vlm: 'g26', quant: '4', db: 'comp', clips: 48, ads: 333, adTime: '22:22', chain: 3.33, mem: 44.4, at: '11-23 22:22', took: '1:11:11', base: true },
    { id: 'R-0004', exp: 'E2', judge: 'g26', vlm: 'g12', quant: '4', db: 'comp', clips: 48, ads: 222, adTime: '11:11', chain: 2.22, mem: 33.3, at: '11-23 23:33', took: '55:55' },
    { id: 'R-0005', exp: 'E2', judge: 'ge4', vlm: 'ge4', quant: '4', db: 'comp', clips: 48, ads: 111, adTime: '5:55', chain: 1.11, mem: 11.1, at: '11-24 00:44', took: '44:44' },
    { id: 'R-0006', exp: 'E6', judge: 'g26', vlm: 'g26', quant: '4', db: 'comp', users: [1, 2, 4, 8, 16], chainBy: [1.11, 2.22, 3.33, 5.55, 9.99], over: [0, 0, 1.1, 5.5, 22.2], at: '11-24 02:22', took: '33:33', base: true },
  ];
  const cfgText = (r) => (r.exp === 'E1' ? modelName(r.judge) : modelName(r.judge) + ' / ' + modelName(r.vlm || 'g26')) + ' · ' + quantName(r.quant);

  const R = {
    form: { exp: 'E1', db: 'det-dev', judge: 'ge4', vlm: 'g26', quant: '8', repeat: 3, users: '1 · 2 · 4 · 8 · 16' },
    // 처음은 시연 상태(도는 실험 없음). 주소에 ?mode=exp 를 붙이면 R-0014 가 도는 실험 상태로 연다(init).
    running: null,
    queue: [],
    next: 17, timer: null, sel: new Set(RUNS.filter((r) => r.exp === 'E1').map((r) => r.id)), tab: 'E1',
  };
  // 서버 상태 전환 기록(가짜). 새 전환은 뒤에 붙고 화면에는 최근 것부터 보인다.
  const TRANSITIONS = [
    { at: '11-23 21:11', to: 'exp', why: ['R-0003 E2 해설 생성 시작', 'R-0003 E2 started'], load: ['Gemma 4 26B-A4B · 4비트 + 음성 인식 · 합성 · 임베딩', 'Gemma 4 26B-A4B · 4-bit + ASR · TTS · embedding'], took: '1:11' },
    { at: '11-24 02:55', to: 'demo', why: ['대기열이 빔', 'Queue empty'], load: ['기본 구성 다시 올림', 'Default configuration reloaded'], took: '2:22' },
    { at: '11-24 08:48', to: 'exp', why: ['R-0007 E1 탐지 성능 시작', 'R-0007 E1 started'], load: ['Gemma 4 26B-A4B · 16비트(판단 LLM 하나)', 'Gemma 4 26B-A4B · 16-bit (judge only)'], took: '1:11' },
    { at: '11-24 11:44', to: 'demo', why: ['대기열이 빔', 'Queue empty'], load: ['기본 구성 다시 올림', 'Default configuration reloaded'], took: '2:22' },
    { at: '11-24 14:11', to: 'exp', why: ['R-0014 E1 탐지 성능 시작', 'R-0014 E1 started'], load: ['Gemma 4 12B · 8비트(판단 LLM 하나)', 'Gemma 4 12B · 8-bit (judge only)'], took: '1:11', expOnly: true },
  ];
  const isExp = () => !!R.running || R.queue.length > 0;
  function seedExp() {
    R.running = { id: 'R-0014', exp: 'E1', judge: 'g12', quant: '8', db: 'det-dev', pct: 62, paused: false };
    R.queue = [
      { id: 'R-0015', exp: 'E1', judge: 'ft4', quant: '4', db: 'det-dev' },
      { id: 'R-0016', exp: 'E2', judge: 'g26', vlm: 'g26', quant: '4', db: 'comp' },
    ];
  }
  const loadText = (job) => (job.exp === 'E1'
    ? [`${modelName(job.judge)} · ${quantName(job.quant)}(판단 LLM 하나)`, `${modelName(job.judge)} · ${quantName(job.quant)} (judge only)`]
    : [`${modelName(job.judge)} / ${modelName(job.vlm || 'g26')} · ${quantName(job.quant)} + 음성 인식 · 합성 · 임베딩`, `${modelName(job.judge)} / ${modelName(job.vlm || 'g26')} · ${quantName(job.quant)} + ASR · TTS · embedding`]);
  function toExp(job) {
    TRANSITIONS.push({ at: '11-24 14:44', to: 'exp', why: [`${job.id} ${EXP[job.exp].name[0]} 시작`, `${job.id} ${EXP[job.exp].name[1]} started`], job, took: '1:11' });
  }
  function toDemo(why) {
    TRANSITIONS.push({ at: '11-24 15:55', to: 'demo', why, load: ['기본 구성 다시 올림', 'Default configuration reloaded'], took: '2:22' });
    LAB.toast(t('대기열이 비어 시연 상태로 돌아갑니다. 기본 구성을 다시 올립니다(1 ~ 3분).', 'Queue empty: returning to demo mode and reloading the default configuration (1–3 min).'));
    if (S.route === '/status') LAB.render();
  }
  // 시연 상태에서 첫 실행을 걸 때 묻는다.
  function confirmStart(job, ok) {
    const d = document.createElement('div'); d.className = 'dim';
    d.innerHTML = `<div class="dialog wide"><h2>${t('실행하면 시연 상태가 끝납니다', 'Running ends demo mode')}</h2>
      <p class="muted mt8">${esc(job.id)} · ${expName(job.exp)} · ${esc(cfgText(job))}</p>
      <ul class="mt12 small" style="padding-left:18px;margin-bottom:0;line-height:1.7">
        <li>${t('기본 구성과 음성 인식 · 합성 · 임베딩을 내리고, 이 실험에 필요한 모델만 올립니다(1 ~ 3분).', 'The default configuration and ASR · TTS · embedding are unloaded; only the models this experiment needs are loaded (1–3 min).')}</li>
        <li>${t('실험 중에는 처리해 둔 영상의 재생과 실시간 재현만 됩니다. 새 영상 올리기와 다른 구성 고르기, 실시간 시연(Electron)은 막힙니다.', 'While it runs, only processed videos and replays play. Uploads, other configurations and the live Electron demo are blocked.')}</li>
        <li>${t('E6 · E8의 지연 측정이 다른 요청과 섞이지 않게 하기 위해서입니다.', 'This keeps E6 · E8 latency measurements free of other requests.')}</li>
        <li>${t('대기열이 비면 기본 구성을 다시 올려 시연 상태로 돌아갑니다(1 ~ 3분).', 'When the queue is empty, the default configuration is reloaded (1–3 min).')}</li>
      </ul>
      <div class="row mt20" style="justify-content:flex-end"><button class="btn" data-x>${t('취소', 'Cancel')}</button><button class="btn primary" data-ok>${t('실험 상태로 바꾸고 실행', 'Switch and run')}</button></div></div>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.hasAttribute('data-x')) d.remove();
      if (e.target.hasAttribute('data-ok')) { d.remove(); ok(); }
    });
  }
  const LOGS = [
    [0, 'w', '기본 구성 내리는 중 · 시연 상태를 끝내고 실험 상태로 바꿈'], [4, '', '실험 모델 올리는 중 · 판단 LLM 하나만 가중치 읽기'], [12, 'ok', '모델 준비 끝 · 응답 확인'],
    [16, '', '문항 3,600개 읽음 · 반복 1 / 3 시작'], [30, '', '진행 1,111 / 3,600 · 판단 지연 중앙값 0.33초'], [45, 'ok', '반복 1 / 3 끝 · F1 66.6'],
    [50, '', '반복 2 / 3 시작'], [62, '', '진행 2,222 / 3,600 · 판단 지연 중앙값 0.33초'], [75, 'ok', '반복 2 / 3 끝 · F1 66.6'],
    [80, '', '반복 3 / 3 시작'], [92, '', '진행 3,333 / 3,600'], [99, 'ok', '반복 3 / 3 끝 · 결과 저장'],
  ];
  function logHtml(run) {
    return LOGS.filter((l) => l[0] <= run.pct).map((l, i) =>
      `<span class="t">14:${String(22 + i).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}</span> <span class="${l[1]}">${esc(l[2])}</span>`).join('\n');
  }

  /* ── 실험 실행 ────────────────────── */
  function viewRun(shell, route) {
    const id = route.split('/')[2];
    if (id) return viewRunDetail(shell, id);
    const f = R.form;
    if (S.q.exp && !R.expSeeded) { f.exp = S.q.exp; f.db = S.q.exp === 'E1' ? 'det-dev' : 'comp'; R.expSeeded = true; }
    const sel = (key, list) => `<select data-rsel="${key}">${list.map(([v, l, dis]) => `<option value="${v}" ${f[key] === v ? 'selected' : ''} ${dis ? 'disabled' : ''}>${l}</option>`).join('')}</select>`;
    const models = MODELS.map((m) => [m.id, m.name + (m.trained ? t(' · 학습판', ' · fine-tuned') : '') + (m.base ? t(' (기준)', ' (baseline)') : '')]);
    const dbList = f.exp === 'E1' ? [['det-dev', dbName('det-dev')], ['det-rep', dbName('det-rep'), true]] : [['comp', dbName('comp')]];
    const run = R.running;
    const runCard = run ? `
      <div class="card card-pad">
        <div class="row"><h2>${t('실행 중', 'Running')} <small>${run.id}</small></h2><span class="spacer"></span>
          <span class="chip ${run.paused ? 'warn' : 'blue'}">${run.paused ? t('멈춤', 'Paused') : t('도는 중', 'In progress')}</span></div>
        <div class="row wrap mt8"><span class="chip">${expName(run.exp)}</span><span class="chip">${esc(cfgText(run))}</span><span class="chip">${dbName(run.db)}</span></div>
        <div class="row mt16"><b class="num" style="font-size:24px" id="rpct">${Math.round(run.pct)}%</b><span class="spacer"></span><span class="muted small">${t('남은 시간', 'Remaining')} <b class="fake num" id="rleft">${mmss((100 - run.pct) * 6660)}</b></span></div>
        <div class="bar mt8"><i id="rbar" style="width:${run.pct}%"></i></div>
        <div class="log mt12" id="rlog">${logHtml(run)}</div>
        <div class="row mt12" style="justify-content:flex-end">
          ${run.paused ? `<button class="btn" data-act="rcancel">${t('실행 취소', 'Cancel run')}</button><button class="btn primary" data-act="rresume">${t('이어 하기', 'Resume')}</button>`
            : `<button class="btn danger" data-act="rpause">${t('중단', 'Stop')}</button>`}
        </div>
      </div>` : `<div class="card card-pad"><div class="row"><h2>${t('실행 중', 'Running')}</h2><span class="spacer"></span><span class="chip ok">${t('시연 상태', 'Demo mode')}</span></div>
        <p class="muted mt8">${t('지금 도는 실행이 없습니다. GPU에는 기본 구성(Gemma 4 26B-A4B · 4비트)과 음성 인식 · 합성 · 임베딩이 올라와 있습니다.', 'Nothing is running. The GPU holds the default configuration (Gemma 4 26B-A4B · 4-bit) with ASR · TTS · embedding.')}</p></div>`;
    const queue = R.queue.length ? R.queue.map((q, i) => `<tr><td class="num">${i + 1}</td><td><b>${q.id}</b></td><td>${expName(q.exp)}</td><td>${esc(cfgText(q))}</td><td class="r"><button class="btn sm" data-act="qdel" data-id="${q.id}">${t('빼기', 'Remove')}</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="muted">${t('기다리는 실행이 없습니다.', 'The queue is empty.')}</td></tr>`;
    const done = RUNS.slice().sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 5).map((r) => `<tr class="click" data-go="/run/${r.id}"><td><b>${r.id}</b></td><td>${expName(r.exp)}</td><td>${esc(cfgText(r))}</td><td class="num">${fk(r.at)}</td><td class="r"><span class="chip ok">${t('끝남', 'Done')}</span></td></tr>`).join('');
    return shell(`
      <div class="page-head"><div><h1>${t('실험 실행', 'Run experiments')}</h1><p>${t('테스트 DB · 모델 · 양자화를 골라 실행합니다. 한 번에 1건만 돌고 나머지는 순서를 기다립니다.', 'Choose a test DB, models and quantization. One run at a time; the rest wait in the queue.')}</p></div></div>
      <div class="split">
        <div class="card card-pad">
          <h2>${t('새 실행', 'New run')}</h2>
          <div class="field"><label>${t('실험', 'Experiment')}</label>
            <div class="seg" data-rseg="exp">${Object.keys(EXP).map((k) => `<button data-v="${k}" class="${f.exp === k ? 'on' : ''}">${expName(k)}</button>`).join('')}</div>
            <p class="help">${t(EXP[f.exp].desc[0], EXP[f.exp].desc[1])}</p></div>
          <div class="field"><label>${t('테스트 DB', 'Test DB')}</label>${sel('db', dbList)}</div>
          <div class="field"><label>${t('판단 LLM', 'Judge LLM')}</label>${sel('judge', models)}</div>
          ${f.exp === 'E1' ? '' : `<div class="field"><label>${t('생성 VLM', 'Generation VLM')}</label>${sel('vlm', models)}</div>`}
          <div class="field"><label>${t('양자화', 'Quantization')}</label>
            <div class="seg" data-rseg="quant">${QUANTS.map((q) => `<button data-v="${q.id}" class="${f.quant === q.id ? 'on' : ''}">${t(q.ko, q.en)}<small>${q.file}</small></button>`).join('')}</div></div>
          ${f.exp === 'E6'
            ? `<div class="field"><label>${t('동시 사용자 수', 'Concurrent users')}</label><input type="text" value="${f.users}"></div>`
            : `<div class="field"><label>${t('반복 횟수', 'Repetitions')}</label><input type="number" value="${f.exp === 'E1' ? 3 : 2}" min="1" max="5"></div>`}
          ${f.exp === 'E2' ? `<div class="note info mt16">${t('전달 방식은 교차 모드 · 균형으로 고정합니다. 이해도 정답률은 이 실행에서 나오지 않습니다(답변 LLM 채점은 따로 돌립니다).', 'Delivery is fixed to interleaved · balanced. Comprehension accuracy is not produced by this run (answer-LLM scoring runs separately).')}</div>` : ''}
          ${isExp()
            ? `<div class="note info mt16">${t(`지금 실험 상태입니다(${R.running ? R.running.id : ''}). 새 실행은 대기열 뒤에 붙습니다. 대기열이 비면 기본 구성을 다시 올려 시연 상태로 돌아갑니다.`, `The server is in experiment mode (${R.running ? R.running.id : ''}). New runs join the end of the queue. When the queue is empty, the default configuration is reloaded and the server returns to demo mode.`)}</div>`
            : `<div class="note mt16"><b>${t('실행하면 시연 상태가 끝납니다.', 'Running ends demo mode.')}</b> ${t('기본 구성과 음성 인식 · 합성 · 임베딩을 내리고 이 실험에 필요한 모델만 올립니다(1 ~ 3분). 실험이 도는 동안은 처리해 둔 영상의 재생만 되고, 새 영상 올리기와 다른 구성 고르기는 막힙니다. 대기열이 비면 기본 구성을 다시 올려 시연 상태로 돌아갑니다.', 'The default configuration and ASR · TTS · embedding are unloaded and only the models this experiment needs are loaded (1–3 min). While it runs, only processed videos can be played; new uploads and other configurations are blocked. When the queue is empty, the default configuration is reloaded.')}</div>`}
          <p class="help muted small mt8">${t('모델 목록은 예시이고 평가 설계가 정해지면 바꿉니다.', 'The model list is an example and will follow the final evaluation design.')}</p>
          <div class="row mt16" style="justify-content:flex-end"><button class="btn primary lg" data-act="renq">${isExp() ? t('대기열에 넣기', 'Add to queue') : t('실행 · 실험 상태로 바꾸기', 'Run · switch to experiment mode')}</button></div>
        </div>
        <div class="grid">
          ${runCard}
          <div class="card"><div class="card-pad" style="padding-bottom:8px"><h2>${t('대기열', 'Queue')} <small>${R.queue.length}${t('건', '')}</small></h2></div>
            <table><thead><tr><th>${t('순번', '#')}</th><th>${t('실행', 'Run')}</th><th>${t('실험', 'Experiment')}</th><th>${t('구성', 'Configuration')}</th><th></th></tr></thead><tbody>${queue}</tbody></table></div>
          <div class="card"><div class="card-pad row" style="padding-bottom:8px"><h2>${t('끝난 실행', 'Finished runs')}</h2><span class="spacer"></span><a class="btn sm" href="#/compare">${t('결과 비교로', 'Compare results')}</a></div>
            <table><thead><tr><th>${t('실행', 'Run')}</th><th>${t('실험', 'Experiment')}</th><th>${t('구성', 'Configuration')}</th><th>${t('끝난 때', 'Finished')}</th><th></th></tr></thead><tbody>${done}</tbody></table></div>
        </div>
      </div>`);
  }
  function tickRun() {
    clearInterval(R.timer);
    R.timer = setInterval(() => {
      const run = R.running;
      if (!run || run.paused || S.q.freeze) return;
      run.pct = Math.min(100, run.pct + (run.fast ? 2.2 : 0.35));
      if (S.route === '/run') {
        const b = $('#rbar');
        if (b) {
          b.style.width = run.pct + '%';
          $('#rpct').textContent = Math.round(run.pct) + '%';
          $('#rleft').textContent = mmss((100 - run.pct) * 6660);
          const lg = $('#rlog'); const h = logHtml(run);
          if (lg.dataset.h !== String(h.length)) { lg.innerHTML = h; lg.dataset.h = String(h.length); lg.scrollTop = lg.scrollHeight; }
        }
      }
      if (run.pct >= 100) {
        const f1 = [22.2, 55.5, 77.7][R.next % 3];
        RUNS.push(run.exp === 'E1'
          ? { id: run.id, exp: 'E1', judge: run.judge, quant: run.quant, db: run.db, f1, lat: 0.55, p95: 0.77, mem: 7.7, at: '11-24 14:44', took: '8:88' }
          : { id: run.id, exp: run.exp, judge: run.judge, vlm: run.vlm || 'g26', quant: run.quant, db: 'comp', clips: 48, ads: 77, adTime: '7:77', chain: 7.77, mem: 7.7, users: [1, 2, 4, 8, 16], chainBy: [1.11, 2.22, 3.33, 5.55, 9.99], over: [0, 0, 1.1, 5.5, 22.2], at: '11-24 14:44', took: '8:88' });
        if (run.exp === 'E1') R.sel.add(run.id);
        LAB.toast(t(`${run.id} 실행이 끝났습니다. 「끝난 실행」에서 결과를 볼 수 있습니다.`, `${run.id} finished. Open it from “Finished runs”.`));
        const nx = R.queue.shift();
        R.running = nx ? Object.assign({ pct: 0, paused: false, fast: true }, nx) : null;
        if (!R.running) setTimeout(() => toDemo(['대기열이 빔', 'Queue empty']), 1500);
        if (S.route === '/run' || S.route === '/status') LAB.render(); else LAB.refreshChrome();
      }
    }, 250);
  }

  /* ── 실행 결과 ────────────────────── */
  function viewRunDetail(shell, id) {
    const r = RUNS.find((x) => x.id === id) || RUNS[2];
    const head = `
      <div class="crumb"><a href="#/run">${t('실험 실행', 'Run experiments')}</a> › ${r.id}</div>
      <div class="page-head"><div><h1>${r.id} · ${expName(r.exp)}</h1><p>${esc(cfgText(r))} · ${dbName(r.db)} · ${t('끝난 때', 'finished')} ${fk(r.at)} · ${t('걸린 시간', 'took')} ${fk(r.took)}</p></div>
        <div class="row"><button class="btn" data-act="csv">${t('CSV로 내보내기', 'Export CSV')}</button><a class="btn primary" href="#/compare">${t('결과 비교에서 보기', 'Open in Compare')}</a></div></div>`;
    if (r.exp === 'E1') {
      const types = ['simple', 'adj', 'value_to_meaning', 'scale', 'claim_to_value', 'silence'];
      const vals = [99.9, 88.8, 77.7, 66.6, 55.5, 44.4];
      const rows = types.map((k, i) => `<tr><td><b>${typeName(k)}</b></td>
        <td class="r">${fk(vals[i], 1)}</td><td class="r">${fk(vals[i], 1)}</td><td class="r best">${fk(vals[i], 1)}</td>
        <td class="r">${fk(vals[5 - i], 1)}</td><td class="r">${fk(vals[5 - i], 1)}</td><td class="r best">${fk(vals[5 - i], 1)}</td></tr>`).join('');
      return shell(head + `
        <div class="grid g4">
          <div class="card stat"><span>F1-score</span><b>${fk(r.f1, 1)}</b></div>
          <div class="card stat"><span>${t('정밀도 · 재현율', 'Precision · recall')}</span><b>${fk(r.f1, 1)}<small>· ${fk(r.f1, 1)}</small></b></div>
          <div class="card stat"><span>${t('판단 지연 · 중앙값 / 95번째 백분위수', 'Judge latency · median / p95')}</span><b>${fk(r.lat, 2)}<small>/ ${fk(r.p95, 2)} ${t('초', 's')}</small></b></div>
          <div class="card stat"><span>${t('GPU 메모리', 'GPU memory')}</span><b>${fk(r.mem, 1)}<small>GB</small></b></div>
        </div>
        <div class="card mt16 tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('트리거 유형 × 언어', 'Trigger type × language')} <small>${t('반복 3회 평균', 'mean of 3 repetitions')}</small></h2></div>
          <table><thead><tr><th rowspan="2">${t('유형', 'Type')}</th><th class="c" colspan="3">${t('한국어', 'Korean')}</th><th class="c" colspan="3">${t('영어', 'English')}</th></tr>
            <tr><th class="r">${t('정밀도', 'Precision')}</th><th class="r">${t('재현율', 'Recall')}</th><th class="r">F1</th><th class="r">${t('정밀도', 'Precision')}</th><th class="r">${t('재현율', 'Recall')}</th><th class="r">F1</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        <p class="muted small mt12">${t('정답이 들어 있는 탐지 DB로 돌린 실행이라 정밀도 · 재현율 · F1이 나옵니다.', 'This run uses the detection DB with labels, so precision, recall and F1 are available.')}</p>`);
    }
    if (r.exp === 'E6') {
      return shell(head + `
        <div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('동시 사용자 수별', 'By concurrent users')}</h2></div>
          <table><thead><tr><th>${t('동시 사용자', 'Users')}</th><th class="r">${t('처리 사슬 지연 · 중앙값', 'Chain latency · median')}</th><th class="r">${t('시간 제한 초과율', 'Timeout rate')}</th><th class="r">${t('GPU 사용률', 'GPU utilization')}</th></tr></thead>
          <tbody>${r.users.map((u, i) => `<tr><td class="num"><b>${u}${t('명', '')}</b></td><td class="r">${fk(r.chainBy[i], 2)} ${t('초', 's')}</td><td class="r">${fk(r.over[i], 1)} %</td><td class="r">${fk([11, 22, 44, 77, 99][i])} %</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small mt12">${t('처리 사슬 지연 = 트리거 발화의 전사가 끝난 때부터 해설 음성이 준비될 때까지.', 'Chain latency = from the end of the trigger transcript to the description audio being ready.')}</p>`);
    }
    const svc = [[t('음성 인식', 'Speech recognition'), 2222, 0.22, 0.66], [t('판단', 'Judging'), 1111, 0.44, 0.77], [t('해설 생성', 'Generation'), 999, 0.88, 4.44], [t('화면 글자 확인', 'On-screen text check'), 555, 0.77, 3.33], [t('음성 합성', 'Speech synthesis'), 333, 0.55, 0.99]];
    const clipRows = window.LAB_DB_CLIPS.slice(0, 6).map((c, i) => `<tr><td><b>${c.id}</b></td><td>${catName(c.cat)}</td><td>${c.lang === 'ko' ? t('한국어', 'Korean') : t('영어', 'English')}</td>
      <td class="r">${fk([9, 7, 8, 5, 6, 3][i])}</td><td class="r">${fk(['1:11', '1:11', '0:55', '0:44', '0:55', '0:33'][i])}</td>
      <td class="r">${i === 0 ? `<a class="btn sm" href="#/demo/play">${t('재생', 'Play')}</a>` : `<button class="btn sm" disabled>${t('재생', 'Play')}</button>`}</td></tr>`).join('');
    return shell(head + `
      <div class="grid g4">
        <div class="card stat"><span>${t('클립', 'Clips')}</span><b class="num">${r.clips}</b></div>
        <div class="card stat"><span>${t('해설 수 · 총 해설 시간', 'Descriptions · total time')}</span><b>${fk(r.ads)}<small>· ${fk(r.adTime)}</small></b></div>
        <div class="card stat"><span>${t('처리 사슬 지연 · 중앙값', 'Chain latency · median')}</span><b>${fk(r.chain, 2)}<small>${t('초', 's')}</small></b></div>
        <div class="card stat"><span>${t('GPU 메모리', 'GPU memory')}</span><b>${fk(r.mem, 1)}<small>GB</small></b></div>
      </div>
      <div class="grid g2 mt16">
        <div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('단계별 지연', 'Latency by stage')}</h2></div>
          <table><thead><tr><th>${t('단계', 'Stage')}</th><th class="r">${t('호출', 'Calls')}</th><th class="r">${t('중앙값', 'Median')}</th><th class="r">${t('95번째 백분위수', 'p95')}</th></tr></thead>
          <tbody>${svc.map((s) => `<tr><td>${s[0]}</td><td class="r">${fk(s[1].toLocaleString())}</td><td class="r">${fk(s[2], 2)} ${t('초', 's')}</td><td class="r">${fk(s[3], 2)} ${t('초', 's')}</td></tr>`).join('')}</tbody></table></div>
        <div class="card card-pad"><h2>${t('후보에서 해설까지', 'From candidates to descriptions')}</h2>
          <div class="funnel mt12"><div><b>${fk('1,111')}</b><span>${t('트리거 후보', 'Candidates')}</span></div><div><b>${fk(777)}</b><span>${t('판단 O', 'Judged yes')}</span></div><div><b>${fk(444)}</b><span>${t('생성', 'Generated')}</span></div><div><b>${fk(r.ads)}</b><span>${t('재생', 'Played')}</span></div></div>
          <div class="note info mt16">${t('영상 처리에서 나오는 지표만 보여 줍니다. 정답이 있어야 하는 이해도 정답률 · 탐지 성능은 이 실행에서 나오지 않습니다.', 'Only metrics that come out of processing are shown. Comprehension accuracy and detection performance need labels and are not produced here.')}</div></div>
      </div>
      <div class="card mt16 tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('클립별', 'By clip')} <small>${t('48개 중 6개', '6 of 48')}</small></h2></div>
        <table><thead><tr><th>${t('클립', 'Clip')}</th><th>${t('범주', 'Category')}</th><th>${t('언어', 'Language')}</th><th class="r">${t('해설 수', 'Descriptions')}</th><th class="r">${t('처리 시간', 'Processing time')}</th><th></th></tr></thead><tbody>${clipRows}</tbody></table></div>`);
  }

  /* ── 결과 비교 ────────────────────── */
  function plot(rows) {
    const W = 620, H = 400, L = 56, Rm = 20, T = 20, B = 46;
    const x = (v) => L + (v / 1.2) * (W - L - Rm), y = (v) => H - B - (v / 110) * (H - T - B);
    const gx = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((v) => `<line class="ax" x1="${x(v)}" y1="${T}" x2="${x(v)}" y2="${H - B}"/><text x="${x(v)}" y="${H - B + 18}" text-anchor="middle">${v.toFixed(1)}</text>`).join('');
    const gy = [0, 20, 40, 60, 80, 100].map((v) => `<line class="ax" x1="${L}" y1="${y(v)}" x2="${W - Rm}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const pts = rows.map((r) => {
      const m = MODELS.find((k) => k.id === r.judge);
      const col = m.trained ? 'var(--ok)' : 'var(--brand)';
      const rad = 5 + Math.sqrt(r.mem) * 1.9;
      const label = m.name.replace('Gemma 4 ', '') + (m.trained ? t(' 학습판', ' FT') : '') + ' · ' + quantName(r.quant);
      const right = x(r.lat) > W - 190;
      return `<circle cx="${x(r.lat)}" cy="${y(r.f1)}" r="${rad}" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width="2"/><text class="lbl" x="${right ? x(r.lat) - rad - 5 : x(r.lat) + rad + 5}" y="${y(r.f1) + 4}" text-anchor="${right ? 'end' : 'start'}">${label}</text>`;
    }).join('');
    return `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="F1 vs latency">
      ${gx}${gy}
      <text x="${(L + W - Rm) / 2}" y="${H - 6}" text-anchor="middle">${t('판단 지연 · 중앙값(초)', 'Judge latency · median (s)')}</text>
      <text x="14" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(T + H - B) / 2})">F1-score</text>
      <text x="${W - Rm - 6}" y="${H - B - 10}" text-anchor="end" style="font-size:22px;font-weight:800;fill:var(--warn);opacity:.35">${t('가짜 값', 'FAKE DATA')}</text>
      ${pts}</svg>`;
  }
  function viewCompare(shell) {
    if (S.q.ctab && !R.tabSeeded) { R.tab = S.q.ctab; R.tabSeeded = true; }
    const tabs = Object.keys(EXP).map((k) => `<button data-ctab="${k}" class="${R.tab === k ? 'on' : ''}">${expName(k)}${k === 'E1' ? t(' · E8 모델 비교', ' · E8 model comparison') : ''}</button>`).join('');
    let body;
    if (R.tab === 'E1') {
      const rows = RUNS.filter((r) => r.exp === 'E1');
      const picked = rows.filter((r) => R.sel.has(r.id));
      const bestF = Math.max(...picked.map((r) => r.f1), 0), bestL = Math.min(...picked.map((r) => r.lat), 9);
      body = `<div class="grid" style="grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start">
        <div class="card tbl-wrap"><div class="card-pad row" style="padding-bottom:8px"><h2>${t('실행 목록', 'Runs')} <small>${picked.length} / ${rows.length} ${t('고름', 'selected')}</small></h2><span class="spacer"></span><button class="btn sm" data-act="csv">${t('CSV로 내보내기', 'Export CSV')}</button></div>
          <table><thead><tr><th></th><th>${t('실행', 'Run')}</th><th>${t('판단 LLM', 'Judge LLM')}</th><th>${t('양자화', 'Quant.')}</th><th class="r">F1</th><th class="r">${t('지연(초)', 'Latency (s)')}</th><th class="r">${t('메모리(GB)', 'Memory (GB)')}</th></tr></thead>
          <tbody>${rows.map((r) => `<tr class="click ${R.sel.has(r.id) ? 'sel' : ''}" data-pick="${r.id}"><td><input type="checkbox" ${R.sel.has(r.id) ? 'checked' : ''} tabindex="-1"></td>
            <td><a href="#/run/${r.id}"><b>${r.id}</b></a>${r.base ? ` <span class="chip">${t('기준', 'baseline')}</span>` : ''}</td><td>${esc(modelName(r.judge))}</td><td>${quantName(r.quant)}</td>
            <td class="r ${R.sel.has(r.id) && r.f1 === bestF ? 'best' : ''}">${fk(r.f1, 1)}</td><td class="r ${R.sel.has(r.id) && r.lat === bestL ? 'best' : ''}">${fk(r.lat, 2)}</td><td class="r">${fk(r.mem, 1)}</td></tr>`).join('')}</tbody></table></div>
        <div class="card card-pad"><h2>${t('정확도와 지연', 'Accuracy versus latency')} <small>${t('점 하나 = 모델 × 양자화, 점 크기 = GPU 메모리', 'one point = model × quantization, size = GPU memory')}</small></h2>
          <div class="mt12">${plot(picked)}</div>
          <div class="legend"><span><i></i>${t('배포된 모델', 'Released models')}</span><span><i style="background:var(--ok)"></i>${t('직접 학습한 모델', 'Fine-tuned model')}</span></div></div>
      </div>
      <p class="muted small mt12">${t('E8(모델 비교)은 같은 실험을 모델 · 양자화만 바꿔 여러 번 돌린 뒤 이 화면에서 모아 봅니다. 줄을 누르면 그림에서 넣고 뺍니다.', 'E8 (model comparison) repeats the same experiment with different models and quantization, then gathers the runs here. Click a row to add or remove it from the plot.')}</p>`;
    } else if (R.tab === 'E2') {
      const rows = RUNS.filter((r) => r.exp === 'E2');
      body = `<div class="card tbl-wrap"><div class="card-pad row" style="padding-bottom:8px"><h2>${t('해설 생성 실행', 'Description generation runs')}</h2><span class="spacer"></span><button class="btn sm" data-act="csv">${t('CSV로 내보내기', 'Export CSV')}</button></div>
        <table><thead><tr><th>${t('실행', 'Run')}</th><th>${t('판단 LLM', 'Judge LLM')}</th><th>${t('생성 VLM', 'Generation VLM')}</th><th>${t('양자화', 'Quant.')}</th><th class="r">${t('해설 수', 'Descriptions')}</th><th class="r">${t('총 해설 시간', 'Total time')}</th><th class="r">${t('처리 사슬 지연(초)', 'Chain latency (s)')}</th><th class="r">${t('메모리(GB)', 'Memory (GB)')}</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="click" data-go="/run/${r.id}"><td><b>${r.id}</b>${r.base ? ` <span class="chip">${t('기준', 'baseline')}</span>` : ''}</td><td>${esc(modelName(r.judge))}</td><td>${esc(modelName(r.vlm))}</td><td>${quantName(r.quant)}</td>
          <td class="r">${fk(r.ads)}</td><td class="r">${fk(r.adTime)}</td><td class="r">${fk(r.chain, 2)}</td><td class="r">${fk(r.mem, 1)}</td></tr>`).join('')}</tbody></table></div>
        <div class="note info mt16">${t('해설 생성 실행에는 처리 지표만 있습니다. 이해도 정답률은 답변 LLM 채점을 따로 돌려야 나오므로 이 표에 넣지 않습니다.', 'Generation runs carry processing metrics only. Comprehension accuracy needs separate answer-LLM scoring and is not part of this table.')}</div>`;
    } else {
      const r = RUNS.find((x) => x.exp === 'E6');
      body = `<div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('동시 사용자 수별 지연', 'Latency by concurrent users')} <small>${r.id} · ${esc(cfgText(r))}</small></h2></div>
        <table><thead><tr><th>${t('동시 사용자', 'Users')}</th>${r.users.map((u) => `<th class="r">${u}${t('명', '')}</th>`).join('')}</tr></thead>
        <tbody><tr><td>${t('처리 사슬 지연 · 중앙값(초)', 'Chain latency · median (s)')}</td>${r.chainBy.map((v) => `<td class="r">${fk(v, 2)}</td>`).join('')}</tr>
          <tr><td>${t('시간 제한 초과율(%)', 'Timeout rate (%)')}</td>${r.over.map((v) => `<td class="r">${fk(v, 1)}</td>`).join('')}</tr></tbody></table></div>`;
    }
    return shell(`
      <div class="page-head"><div><h1>${t('결과 비교', 'Compare results')}</h1><p>${t('끝난 실행을 골라 표와 그림으로 나란히 봅니다.', 'Pick finished runs and compare them in a table and a plot.')}</p></div></div>
      <div class="card" style="margin-bottom:16px"><div class="tabs">${tabs}</div></div>
      ${body}`);
  }

  /* ── 모델 · 서버 상태 ─────────────── */
  // GPU 1장. 시연 상태 = 기본 구성 + 음성 인식 · 합성 · 임베딩, 실험 상태 = 실험에 필요한 모델만.
  function viewStatus(shell) {
    const run = R.running;
    const exp = isExp();
    const job = run || R.queue[0];
    const loaded = exp
      ? (job && job.exp === 'E1'
        ? [[t('판단 LLM', 'Judge LLM'), cfgText(job), t('실험', 'experiment')]]
        : [[t('판단 LLM', 'Judge LLM'), modelName(job.judge) + ' · ' + quantName(job.quant), t('실험', 'experiment')], [t('생성 VLM', 'Generation VLM'), modelName(job.vlm || 'g26') + ' · ' + quantName(job.quant), t('실험', 'experiment')],
          [t('음성 인식', 'Speech recognition'), 'faster-whisper large-v3', ''], [t('음성 합성 · 임베딩 · OCR', 'TTS · embedding · OCR'), 'TTS · embed', '']])
      : [[t('판단 · 생성', 'Judge · generation'), 'Gemma 4 26B-A4B · ' + t('4비트', '4-bit'), t('기본 구성', 'default')], [t('음성 인식', 'Speech recognition'), 'faster-whisper large-v3', ''], [t('음성 합성 · 임베딩 · OCR', 'TTS · embedding · OCR'), 'TTS · embed', '']];
    const used = exp ? (job && job.exp === 'E1' ? 22.2 : 55.5) : 44.4;
    const gpuCard = `<div class="card gpu one">
      <div class="top-row"><span class="name">GPU · RTX PRO 6000 · 96 GB</span><span class="chip ${exp ? 'warn' : 'ok'}">${exp ? t('실험 상태', 'Experiment mode') : t('시연 상태', 'Demo mode')}</span></div>
      <div class="mem"><span>${t('메모리', 'Memory')}</span><span>${fk(used, 1)} / 96 GB</span></div>
      <div class="bar thin"><i style="width:${(used / 96) * 100}%"></i></div>
      <ul>${loaded.map((i) => `<li><span>${esc(i[0])}</span><span class="muted">${esc(i[1])}${i[2] ? ` <span class="chip ${exp ? 'warn' : 'ok'}" style="height:18px;font-size:11px">${esc(i[2])}</span>` : ''}</span></li>`).join('')}</ul>
      ${exp && run ? `<div class="note info mt12">${t(`${run.id} ${expName(run.exp)}이(가) 돌고 있습니다. 대기열 ${R.queue.length}건이 끝나면 시연 상태로 돌아갑니다.`, `${run.id} (${expName(run.exp)}) is running. After ${R.queue.length} queued run(s), the server returns to demo mode.`)}</div>` : ''}
    </div>`;
    const modes = `<div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('두 상태', 'Two modes')} <small>${t('GPU 1장을 번갈아 쓴다', 'one GPU, used in turns')}</small></h2></div>
      <table><thead><tr><th>${t('상태', 'Mode')}</th><th>${t('올라가는 것', 'Loaded')}</th><th>${t('되는 것', 'Available')}</th></tr></thead><tbody>
        <tr class="${exp ? '' : 'sel'}"><td style="white-space:nowrap"><b>${t('시연', 'Demo')}</b></td><td>${t('기본 구성(Gemma 4 26B-A4B · 4비트), 음성 인식 · 합성 · 임베딩', 'Default configuration (Gemma 4 26B-A4B · 4-bit), ASR · TTS · embedding')}</td><td>${t('영상 올리기, 다른 구성 고르기, 재생 · 실시간 재현, 실시간 시연(Electron)', 'Uploads, other configurations, playback · replay, live Electron demo')}</td></tr>
        <tr class="${exp ? 'sel' : ''}"><td style="white-space:nowrap"><b>${t('실험', 'Experiment')}</b></td><td>${t('실험에 필요한 모델만 단독으로(E1은 판단 LLM 하나)', 'Only the models the experiment needs (E1: the judge LLM alone)')}</td><td>${t('처리해 둔 영상의 재생 · 실시간 재현만. 올리기 · 다른 구성 · 실시간 시연은 막힘', 'Playback and replay of processed videos only; uploads, other configurations and the live demo are blocked')}</td></tr>
      </tbody></table></div>`;
    const tr = TRANSITIONS.filter((x) => !x.expOnly || R.seeded).slice().reverse();
    const log = `<div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('상태 전환 기록', 'Mode changes')} <small>${t('최근 것부터', 'latest first')}</small></h2></div>
      <table><thead><tr><th>${t('시각', 'Time')}</th><th>${t('전환', 'Change')}</th><th>${t('까닭', 'Reason')}</th><th>${t('올린 것', 'Loaded')}</th><th class="r">${t('걸린 시간', 'Took')}</th></tr></thead><tbody>
      ${tr.map((x) => `<tr><td class="num" style="white-space:nowrap">${fk(x.at)}</td><td style="white-space:nowrap">${x.to === 'exp'
        ? `<span class="chip ok">${t('시연', 'Demo')}</span> → <span class="chip warn">${t('실험', 'Exp.')}</span>`
        : `<span class="chip warn">${t('실험', 'Exp.')}</span> → <span class="chip ok">${t('시연', 'Demo')}</span>`}</td>
        <td>${esc(t(x.why[0], x.why[1]))}</td><td class="small">${esc(x.job ? t(loadText(x.job)[0], loadText(x.job)[1]) : t(x.load[0], x.load[1]))}</td><td class="r">${fk(x.took)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const svcList = [
      ['asr', t('음성 인식', 'Speech recognition'), 'faster-whisper large-v3', 0.22],
      ['judge', t('판단 LLM', 'Judge LLM'), 'Gemma 4 26B-A4B · ' + t('4비트', '4-bit'), 0.44],
      ['vlm', t('생성 VLM', 'Generation VLM'), 'Gemma 4 26B-A4B · ' + t('4비트', '4-bit'), 0.77],
      ['embed', t('화면 글자 확인 · 임베딩', 'On-screen text · embedding'), 'OCR · embed', 0.11],
      ['tts', t('음성 합성', 'Speech synthesis'), 'TTS', 0.55],
    ];
    const upInExp = (k) => (job && job.exp === 'E1' ? k === 'judge' : true);
    const svcModel = (k, base) => {
      if (!exp) return base;
      if (k === 'judge') return modelName(job.judge) + ' · ' + quantName(job.quant);
      if (k === 'vlm') return modelName(job.vlm || 'g26') + ' · ' + quantName(job.quant);
      return base;
    };
    const svc = svcList.map(([k, name, base, ms]) => {
      const up = !exp || upInExp(k);
      return `<tr><td><b>${name}</b></td><td>${esc(up ? svcModel(k, base) : '—')}</td><td>${up ? `<span class="chip ok">${t('올라와 있음', 'Loaded')}</span>` : `<span class="chip">${t('내려 둠', 'Unloaded')}</span>`}</td><td class="r">${up ? `${fk(ms, 2)} ${t('초', 's')}` : '—'}</td></tr>`;
    }).join('');
    const store = [['g26', [55.5, 33.3, 22.2]], ['g12', [22.2, 11.1, 7.7]], ['ge4', [9.9, null, 5.5]], ['ge2', [5.5, null, 3.3]], ['ft4', [null, null, 5.5]]];
    return shell(`
      <div class="page-head"><div><h1>${t('모델 · 서버 상태', 'Models & server')}</h1><p>${t('GPU 1장을 시연 상태와 실험 상태로 번갈아 씁니다. 지금 무엇이 올라와 있는지와 상태 전환 기록, 받아 둔 모델을 봅니다.', 'One GPU is used in turns for demo and experiment modes. See what is loaded now, the mode changes and the stored model weights.')}</p></div>
        <span class="chip ok">${t('서버 정상', 'Server healthy')}</span></div>
      <div class="grid g2" style="align-items:start">
        <div class="grid">${gpuCard}${modes}</div>
        ${log}
      </div>
      <div class="grid g2 mt16" style="align-items:start">
        <div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('서비스', 'Services')} <small>${exp ? t('실험 상태', 'experiment mode') : t('시연 상태', 'demo mode')}</small></h2></div>
          <table><thead><tr><th>${t('서비스', 'Service')}</th><th>${t('모델', 'Model')}</th><th>${t('상태', 'Status')}</th><th class="r">${t('응답 시간', 'Response')}</th></tr></thead>
          <tbody>${svc}</tbody></table></div>
        <div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('받아 둔 모델', 'Stored models')} <small>${t('크기 GB · 목록은 예시', 'size in GB · example list')}</small></h2></div>
          <table><thead><tr><th>${t('모델', 'Model')}</th>${QUANTS.map((q) => `<th class="r">${t(q.ko, q.en)}<br><span style="font-weight:500">${q.file}</span></th>`).join('')}</tr></thead>
          <tbody>${store.map(([id, v]) => `<tr><td><b>${esc(modelName(id))}</b></td>${v.map((x) => `<td class="r">${x == null ? '<span class="muted">—</span>' : fk(x, 1)}</td>`).join('')}</tr>`).join('')}
          <tr><td colspan="4" class="muted small">${t('「—」는 아직 받지 않은 조합입니다. 실행을 걸면 먼저 내려받습니다.', '“—” marks a combination not downloaded yet. It is fetched when a run needs it.')}</td></tr></tbody></table></div>
      </div>
      <div class="grid g3 mt16">
        <div class="card stat"><span>${t('올린 영상 · 7일 뒤 저절로 지움', 'Uploads · auto-deleted after 7 days')}</span><b>${fk(3)}<small>${t('개', 'files')} · ${fk('1.1')} GB</small></b></div>
        <div class="card stat"><span>${t('저장된 실행 결과', 'Stored run results')}</span><b>${fk(RUNS.length)}<small>${t('건', 'runs')}</small></b></div>
        <div class="card stat"><span>${t('연결된 실시간 앱(Electron)', 'Connected real-time apps (Electron)')}</span><b>${fk(0)}<small>${exp ? t('대 · 실험 중에는 붙지 못함', '· blocked during experiments') : t('대 · 기본 구성에 붙음', '· uses the default configuration')}</small></b></div>
      </div>`);
  }

  /* ── 소개 ─────────────────────────── */
  function viewAbout(shell) {
    const map = [
      ['E1', t('탐지 성능', 'Detection'), t('실험 실행 → 실행 결과', 'Run experiments → run result')],
      ['E2', t('이해도(해설 생성까지)', 'Comprehension (up to generation)'), t('실험 실행 → 시연 재생 화면', 'Run experiments → player')],
      ['E6', t('실시간성', 'Real-time capacity'), t('실험 실행 → 실행 결과', 'Run experiments → run result')],
      ['E8', t('모델 비교', 'Model comparison'), t('결과 비교(표와 그림)', 'Compare results (table and plot)')],
    ];
    return shell(`
      <div class="page-head"><div><h1>${t('소개', 'About')}</h1><p>${t('SEEON은 화면을 볼 수 없는 사람이 강의 · 회의 · 보고를 소리만으로 따라갈 수 있게 돕습니다.', 'SEEON helps people who cannot see the screen follow lectures, meetings and briefings by audio alone.')}</p></div></div>
      <div class="card card-pad">
        <h2>${t('처리 흐름', 'Pipeline')}</h2>
        <div class="flow mt12">
          <div class="box"><b>1</b><h3>${t('탐지', 'Detect')}</h3><p>${t('발화에서 「이 부분」, 「10.9」처럼 화면이 있어야 뜻이 통하는 말을 찾고, 판단 LLM이 해설이 필요한지 가립니다.', 'Finds utterances such as “this part” or “10.9” that need the screen, and the judge LLM decides whether a description is needed.')}</p></div>
          <div class="arr">→</div>
          <div class="box"><b>2</b><h3>${t('생성', 'Generate')}</h3><p>${t('VLM이 그때의 화면을 읽어 한 문장 해설을 쓰고, 화면 글자와 대조해 틀린 해설을 거릅니다.', 'The VLM reads the screen at that moment, writes a one-sentence description, and checks it against on-screen text.')}</p></div>
          <div class="arr">→</div>
          <div class="box"><b>3</b><h3>${t('전달', 'Deliver')}</h3><p>${t('해설을 음성으로 만들어 문장이 끝난 자리에 넣습니다(교차 모드). 원음과 함께 들려줄 수도 있습니다(동시 모드).', 'Synthesizes the description and inserts it at a sentence end (interleaved), or plays it alongside the source (simultaneous).')}</p></div>
        </div>
      </div>
      <div class="grid g3 mt16">
        <div class="card card-pad"><h2>${t('시연', 'Demo')}</h2><p class="muted mt8">${t('영상을 고르거나 올리면 해설이 들어간 결과를 재생하고, 후보마다의 판단과 처리 시간을 보여 줍니다.', 'Pick or upload a video to play the result with descriptions, per-candidate decisions and timing.')}</p></div>
        <div class="card card-pad"><h2>${t('실험 실행', 'Run experiments')}</h2><p class="muted mt8">${t('테스트 DB · 모델 · 양자화를 골라 실행하고 진행 상황과 기록을 봅니다.', 'Choose a test DB, models and quantization, then watch progress and logs.')}</p></div>
        <div class="card card-pad"><h2>${t('결과 비교', 'Compare results')}</h2><p class="muted mt8">${t('끝난 실행을 표와 그림으로 나란히 놓고 CSV로 내보냅니다.', 'Put finished runs side by side in a table and a plot, and export CSV.')}</p></div>
      </div>
      <div class="grid g2 mt16" style="align-items:start">
        <div class="card tbl-wrap"><div class="card-pad" style="padding-bottom:8px"><h2>${t('논문 실험과 화면', 'Paper experiments and screens')}</h2></div>
          <table><thead><tr><th>${t('실험', 'Experiment')}</th><th>${t('내용', 'What')}</th><th>${t('이 화면에서', 'In this tool')}</th></tr></thead>
          <tbody>${map.map((m) => `<tr><td><b>${m[0]}</b></td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}
          <tr><td colspan="3" class="muted small">${t('이해도 채점(답변 LLM)과 사람 평가(E3 · E4)는 이 화면에서 다루지 않습니다.', 'Answer-LLM scoring and the human study (E3, E4) are outside this tool.')}</td></tr></tbody></table></div>
        <div class="card card-pad"><h2>${t('버전', 'Versions')}</h2>
          <dl class="kv mt12"><dt>${t('화면', 'This tool')}</dt><dd>${t('목업 0.1 · 2026-11-24', 'mockup 0.1 · 2026-11-24')}</dd>
            <dt>${t('제품 파이프라인', 'Product pipeline')}</dt><dd class="num">seeon-meet 470161e</dd>
            <dt>${t('영상 처리 도구', 'Batch tool')}</dt><dd class="num">seeon-metricsDB 77acfcf</dd>
            <dt>${t('서버', 'Server')}</dt><dd>RTX PRO 6000 96 GB · ${t('1장', '1 GPU')}</dd></dl>
          <div class="note info mt16">${t('실시간 시연(회의 화면을 바로 읽는 것)은 Electron 앱에서 합니다. 이 화면은 녹화 영상만 다룹니다.', 'The live demo (reading a meeting screen as it happens) runs in the Electron app. This tool handles recorded videos only.')}</div></div>
      </div>`);
  }

  LAB.views.run = viewRun;
  LAB.views.compare = viewCompare;
  LAB.views.status = viewStatus;
  LAB.views.about = viewAbout;
  LAB.views.isExp = isExp;
  LAB.views.runLabel = () => (R.running ? R.running.id : '');
  LAB.views.expInfo = () => (R.running ? { id: R.running.id, exp: expName(R.running.exp), queue: R.queue.length } : null);
  LAB.views.init = () => { if (S.q.mode === 'exp') { seedExp(); R.seeded = true; } };
  LAB.views.afterRender = (r) => { if (r === '/run') { const lg = $('#rlog'); if (lg) lg.scrollTop = lg.scrollHeight; } if (!R.timer) tickRun(); };
  LAB.views.onAct = (act, el) => {
    if (act === 'renq') {
      const f = R.form;
      const job = { id: 'R-' + String(R.next).padStart(4, '0'), exp: f.exp, judge: f.judge, vlm: f.vlm, quant: f.quant, db: f.exp === 'E1' ? 'det-dev' : 'comp' };
      const enqueue = () => {
        R.next += 1;
        if (!isExp()) toExp(job);
        if (!R.running) R.running = Object.assign({ pct: 0, paused: false, fast: true }, job); else R.queue.push(job);
        LAB.toast(t(`${job.id} 실행을 대기열에 넣었습니다.`, `${job.id} added to the queue.`)); LAB.render();
      };
      return isExp() ? enqueue() : confirmStart(job, enqueue);
    }
    if (act === 'rpause') { R.running.paused = true; return LAB.render(); }
    if (act === 'rresume') { R.running.paused = false; R.running.fast = true; return LAB.render(); }
    if (act === 'rcancel') {
      const nx = R.queue.shift(); R.running = nx ? Object.assign({ pct: 0, paused: false, fast: true }, nx) : null;
      if (!R.running) toDemo(['실행 취소 · 대기열이 빔', 'Run cancelled · queue empty']);
      return LAB.render();
    }
    if (act === 'qdel') { R.queue = R.queue.filter((q) => q.id !== el.dataset.id); return LAB.render(); }
    if (act === 'csv') return LAB.toast(t('목업에서는 파일을 내려받지 않습니다.', 'Downloads are disabled in this mockup.'));
  };
  LAB.views.onChange = (el) => { if (el.dataset && el.dataset.rsel) R.form[el.dataset.rsel] = el.value; };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rseg] button');
    if (b) { const k = b.closest('[data-rseg]').dataset.rseg; R.form[k] = b.dataset.v; if (k === 'exp') R.form.db = b.dataset.v === 'E1' ? 'det-dev' : 'comp'; return LAB.render(); }
    const c = e.target.closest('[data-ctab]');
    if (c) { R.tab = c.dataset.ctab; return LAB.render(); }
    const p = e.target.closest('[data-pick]');
    if (p && !e.target.closest('a')) { const id = p.dataset.pick; if (R.sel.has(id)) R.sel.delete(id); else R.sel.add(id); return LAB.render(); }
  });
})();
