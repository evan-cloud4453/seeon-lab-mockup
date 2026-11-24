/* SEEON Lab 목업 — 틀, 주소 처리, 시연 화면(목록 · 올리기 · 처리 중 · 재생).
   서버 없이 열리는 정적 화면이다. 숫자는 모두 가짜 값이고, 재생 화면의 해설 문장 · 위치만 실제 처리 결과다. */
(function () {
  'use strict';

  const CLIP = window.LAB_CLIP;
  const S = {
    lang: 'ko', login: true, route: '/demo', q: {},
    upload: { lang: 'ko', mode: 'cross', preset: 'balanced', config: 'default', judge: 'g26', vlm: 'g26', quant: '4' },
    proc: { pct: 0, timer: null },
    play: { cond: 'demo', tab: 'ads', speechCap: true, adCap: true, hide: false, view: 'result' },
  };
  const t = (ko, en) => (S.lang === 'ko' ? ko : en);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const durText = (sec) => t(`${Math.floor(sec / 60)}분 ${sec % 60}초`, `${Math.floor(sec / 60)} min ${sec % 60} s`);

  const MODELS = [
    { id: 'g26', name: 'Gemma 4 26B-A4B', params: '26B', base: true },
    { id: 'g12', name: 'Gemma 4 12B', params: '12B' },
    { id: 'ge4', name: 'Gemma 4 E4B', params: '4B' },
    { id: 'ge2', name: 'Gemma 4 E2B', params: '2B' },
    { id: 'ft4', name: 'Gemma 4 E4B', params: '4B', trained: true },
  ];
  const modelName = (id) => { const m = MODELS.find((x) => x.id === id); return m.name + (m.trained ? t(' · 학습판', ' · fine-tuned') : ''); };
  const QUANTS = [
    { id: '16', ko: '16비트', en: '16-bit', file: 'bf16', sub: ['원본', 'original'] },
    { id: '8', ko: '8비트', en: '8-bit', file: 'FP8', sub: ['', ''] },
    { id: '4', ko: '4비트', en: '4-bit', file: 'AWQ INT4', sub: ['', ''] },
  ];
  const quantName = (id) => { const q = QUANTS.find((x) => x.id === id); return t(q.ko, q.en); };
  const CAT = { '강의': ['강의', 'Lecture'], '회의': ['회의', 'Meeting'], '보고': ['보고', 'Briefing'] };
  const catName = (c) => t(CAT[c][0], CAT[c][1]);
  const TYPE = {
    simple: ['지시대명사', 'Demonstrative'], scale: ['추상적 척도', 'Abstract scale'],
    value_to_meaning: ['단순 수치', 'Bare number'], claim_to_value: ['변화 · 비교 · 결론', 'Change / comparison'],
    adj: ['형용사 + 지시 명사', 'Adjective + deictic noun'], silence: ['무발화', 'Silence'],
  };
  const typeName = (k) => t(TYPE[k][0], TYPE[k][1]);
  const ADKIND = { deixis: ['지시 대상', 'Referent'], interpretation: ['해석', 'Interpretation'], visual_description: ['척도 묘사', 'Scale description'] };
  const adKind = (k) => t(ADKIND[k][0], ADKIND[k][1]);

  const LAB = (window.LAB = { S, t, esc, $, $$, mmss, durText, MODELS, QUANTS, modelName, quantName, catName, typeName, views: {}, go, toast, render, needLogin, refreshChrome });
  // 서버 상태: GPU 1장을 시연 상태(기본 구성)와 실험 상태(실험에서 고른 모델만)로 번갈아 쓴다. 실험 대기열은 views.js 가 들고 있다.
  const isExp = () => !!(LAB.views.isExp && LAB.views.isExp());
  LAB.isExp = isExp;

  /* ── 주소 ─────────────────────────── */
  function parseHash() {
    const h = (location.hash || '#/demo').slice(1);
    const [path, qs] = h.split('?');
    const q = {};
    (qs || '').split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); q[k] = decodeURIComponent(v || ''); });
    S.route = path || '/demo';
    S.q = q;
    if (q.lang) S.lang = q.lang;
    if (q.login) S.login = q.login === '1';
  }
  function go(path) { location.hash = '#' + path; }
  function toast(msg) {
    $$('.toast').forEach((n) => n.remove());
    const n = document.createElement('div'); n.className = 'toast'; n.textContent = msg; document.body.appendChild(n);
    setTimeout(() => n.remove(), 2600);
  }
  function needLogin(fn) { if (S.login) return fn(); openLogin(fn); }
  function stateChip() {
    const exp = isExp();
    const run = exp && LAB.views.runLabel ? LAB.views.runLabel() : '';
    return `<a class="state-chip ${exp ? 'exp' : 'demo'}" href="#/status" title="${t('지금 서버 상태 · 누르면 모델 · 서버 상태로 갑니다', 'Current server state · opens Models & server')}"><i></i>${exp ? t('실험 중', 'Experiment running') + (run ? ' · ' + run : '') : t('시연 상태', 'Demo mode')}</a>`;
  }
  // 머리의 서버 상태 표시만 바꾼다(재생 중인 화면을 다시 그리지 않게).
  function refreshChrome() {
    const old = $('.state-chip');
    if (!old) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = stateChip();
    old.replaceWith(tmp.firstElementChild);
  }

  /* ── 틀 ───────────────────────────── */
  const NAV = [
    ['/demo', ['시연', 'Demo'], false],
    ['/run', ['실험 실행', 'Run experiments'], true],
    ['/compare', ['결과 비교', 'Compare results'], true],
    ['/status', ['모델 · 서버 상태', 'Models & server'], true],
    ['/about', ['소개', 'About'], false],
  ];
  function shell(body) {
    const dark = S.route.startsWith('/demo');
    document.body.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.lang = S.lang;
    const nav = NAV.map(([p, l, lock]) =>
      `<a href="#${p}" class="${S.route.startsWith(p) ? 'on' : ''}">${t(l[0], l[1])}${lock && !S.login ? '<span class="lock">🔒</span>' : ''}</a>`).join('');
    return `
    <header class="top">
      <div class="logo" data-go="/demo"><img src="img/favicon.svg" alt=""><span>SEEON <em>Lab</em></span></div>
      <nav class="nav">${nav}</nav>
      <div class="top-right">
        ${stateChip()}
        <span class="mock-badge">${t('목업 · 숫자는 모두 가짜 값', 'Mockup · all numbers are fake')}</span>
        <span class="lang"><button data-lang="ko" class="${S.lang === 'ko' ? 'on' : ''}">한국어</button><button data-lang="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></span>
        ${S.login
          ? `<span class="user"><i class="dot"></i>${t('연구실 계정', 'Lab account')}</span><button class="btn sm" data-act="logout">${t('로그아웃', 'Sign out')}</button>`
          : `<button class="btn sm primary" data-act="login">${t('로그인', 'Sign in')}</button>`}
      </div>
    </header>
    <main class="page">${body}</main>
    <footer class="foot">${t('SEEON Lab 목업 · 2026-11-24 · 서버 없이 열리는 정적 화면입니다. 버튼을 누르면 가짜 자료로 흐름만 보여 줍니다.',
      'SEEON Lab mockup · 2026-11-24 · A static page without a server. Buttons only walk through the flow with fake data.')}</footer>`;
  }
  function gate(title) {
    return `<div class="card card-pad" style="max-width:520px;margin:60px auto;text-align:center">
      <h2 style="font-size:20px">🔒 ${title}</h2>
      <p class="muted mt8">${t('영상 올리기와 실험 실행은 연구실 비밀번호가 필요합니다. 예시 영상 재생은 로그인 없이 볼 수 있습니다.',
        'Uploading videos and running experiments need the lab password. Example videos play without signing in.')}</p>
      <button class="btn primary mt16" data-act="login">${t('로그인', 'Sign in')}</button></div>`;
  }
  function openLogin(after) {
    const d = document.createElement('div'); d.className = 'dim';
    d.innerHTML = `<div class="dialog"><h2>${t('연구실 로그인', 'Lab sign-in')}</h2>
      <p class="muted small mt8">${t('공용 비밀번호 하나로 들어갑니다. 목업에서는 아무 값이나 넣어도 됩니다.', 'One shared password. Any value works in this mockup.')}</p>
      <div class="field"><label>${t('비밀번호', 'Password')}</label><input type="password" value="seeon-lab" autofocus></div>
      <div class="row mt20" style="justify-content:flex-end"><button class="btn" data-x>${t('닫기', 'Close')}</button><button class="btn primary" data-ok>${t('들어가기', 'Sign in')}</button></div></div>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.hasAttribute('data-x')) d.remove();
      if (e.target.hasAttribute('data-ok')) { S.login = true; d.remove(); if (typeof after === 'function') after(); else render(); }
    });
  }

  /* ── 시연 › 목록 ──────────────────── */
  const CASES = [
    { id: 'a', title: ['사장님 최애 간식이 뭐라구요?', 'What is the boss\'s favourite snack?'], sec: 26, ads: 1 },
    { id: 'b', title: ['10.9? 9.3? 그게 뭔데요?', '10.9? 9.3? What are those?'], sec: 42, ads: 2 },
    { id: 'c', title: ['카드에 뭐가 적혀있는데요?', 'What is written on the cards?'], sec: 36, ads: 1 },
  ];
  const RECENT = [
    { name: '회의_녹화_1124.mp4', sec: 252, cfg: ['기본 구성', 'Default'], st: 'done', left: 7 },
    { name: 'lecture_week12_part2.mp4', sec: 444, cfg: ['Gemma 4 E4B · 4비트', 'Gemma 4 E4B · 4-bit'], st: 'run', left: 7 },
    { name: '세미나_발표_연습.mp4', sec: 333, cfg: ['기본 구성', 'Default'], st: 'done', left: 3 },
  ];
  function viewDemoHome() {
    const cases = CASES.map((c) => `
      <div class="card vcard" data-act="example">
        <div class="thumb" style="background-image:url(img/case-${c.id}.jpg)"><span class="len num">${mmss(c.sec * 1000)}</span></div>
        <div class="meta"><b>${t(c.title[0], c.title[1])}</b>
          <div class="sub">${t('팀이 만든 예시 영상', 'Example made by the team')} · ${t('해설', 'Descriptions')} ${c.ads}</div></div>
      </div>`).join('');
    const clips = window.LAB_DB_CLIPS.map((c) => `
      <div class="card vcard" data-clip="${c.id}">
        <div class="thumb" style="background-image:url(${c.thumb})"><span class="len num">${mmss(c.durSec * 1000)}</span></div>
        <div class="meta"><b>${esc(c.title.split('ㅣ')[0].slice(0, 44))}</b>
          <div class="sub"><span class="chip">${catName(c.cat)}</span> <span class="chip">${c.lang === 'ko' ? t('한국어', 'Korean') : t('영어', 'English')}</span> <span class="chip ${c.id === CLIP.id ? 'ok' : ''}">${c.id === CLIP.id ? t('처리됨', 'Processed') : t('처리 전', 'Not processed')}</span></div></div>
      </div>`).join('');
    const recent = RECENT.map((r) => `<tr class="click" data-act="${r.st === 'done' ? 'openclip' : 'openproc'}">
        <td><b>${esc(r.name)}</b></td><td class="num">${durText(r.sec)}</td><td>${t(r.cfg[0], r.cfg[1])}</td>
        <td>${r.st === 'done' ? `<span class="chip ok">${t('처리됨', 'Done')}</span>` : `<span class="chip blue">${t('처리 중', 'Processing')} <span class="fake">44%</span></span>`}</td>
        <td class="num">${t(`${r.left}일 뒤 삭제`, `Deleted in ${r.left} days`)}</td></tr>`).join('');
    return shell(`
      <section class="hero">
        <div style="flex:1">
          <h1>${t('화면을 듣다', 'Hear the screen')}</h1>
          <p>${t('말만으로는 알 수 없는 화면 정보를 찾아, 짧은 음성 해설로 채웁니다. 영상을 고르거나 올리면 해설이 들어간 결과와 처리 시간을 함께 보여 줍니다.',
            'SEEON finds on-screen information that speech alone does not convey and fills it with short audio descriptions. Pick or upload a video to see the result together with processing time.')}</p>
          ${isExp() ? `<div class="note mt12">${t('지금 실험 중이라 새 영상은 올릴 수 없습니다. 예시 영상과 처리해 둔 영상은 재생됩니다.', 'An experiment is running, so new uploads are paused. Examples and processed videos still play.')}</div>` : ''}
        </div>
        <button class="btn primary lg" data-act="upload">${S.login ? '' : '🔒 '}${t('영상 올리기', 'Upload a video')}</button>
      </section>

      <div class="sec-title"><h2>${t('예시 영상', 'Example videos')}</h2><span class="hint">${t('누구나 볼 수 있습니다', 'Open to everyone')}</span></div>
      <div class="grid g3">${cases}</div>

      <div class="sec-title"><h2>${t('테스트 DB 클립', 'Test DB clips')}</h2><span class="hint">${t('로그인한 사람에게만 보입니다 · 이해도 DB에서 고름', 'Signed-in users only · from the comprehension DB')}</span>
        <span class="spacer"></span>
        ${S.login ? `<span class="chip blue">${t('전체', 'All')}</span><span class="chip">${t('강의', 'Lecture')}</span><span class="chip">${t('회의', 'Meeting')}</span><span class="chip">${t('보고', 'Briefing')}</span><span class="chip">${t('한국어', 'Korean')}</span><span class="chip">${t('영어', 'English')}</span>` : ''}</div>
      <div class="${S.login ? '' : 'locked'}">
        <div class="grid g3">${clips}</div>
        ${S.login ? '' : `<div class="gate"><div><b>🔒 ${t('로그인하면 보입니다', 'Sign in to view')}</b><p class="muted small mt8">${t('평가 클립은 밖에 공개하지 않습니다.', 'Evaluation clips are not shown publicly.')}</p><button class="btn primary sm mt12" data-act="login">${t('로그인', 'Sign in')}</button></div></div>`}
      </div>

      ${S.login ? `<div class="sec-title"><h2>${t('최근 올린 영상', 'Recent uploads')}</h2><span class="hint">${t('올린 영상과 결과는 7일 뒤 저절로 지워집니다', 'Uploads and results are deleted automatically after 7 days')}</span></div>
      <div class="card tbl-wrap"><table><thead><tr><th>${t('파일', 'File')}</th><th>${t('길이', 'Length')}</th><th>${t('모델 구성', 'Configuration')}</th><th>${t('상태', 'Status')}</th><th>${t('보관', 'Retention')}</th></tr></thead><tbody>${recent}</tbody></table></div>` : ''}
    `);
  }

  /* ── 시연 › 영상 올리기 ───────────── */
  function seg(key, list) {
    return `<div class="seg" data-seg="${key}">${list.map(([v, label, small]) =>
      `<button data-v="${v}" class="${S.upload[key] === v ? 'on' : ''}">${label}${small ? `<small>${small}</small>` : ''}</button>`).join('')}</div>`;
  }
  function modelSelect(key, cur) {
    return `<select data-sel="${key}">${MODELS.map((m) => `<option value="${m.id}" ${cur === m.id ? 'selected' : ''}>${m.name}${m.trained ? t(' · 학습판', ' · fine-tuned') : ''}${m.base ? t(' (기준)', ' (baseline)') : ''}</option>`).join('')}</select>`;
  }
  function viewUpload() {
    if (!S.login) return shell(gate(t('영상 올리기', 'Upload a video')));
    const u = S.upload;
    const blocked = isExp();
    const custom = u.config === 'custom';
    const isCross = u.mode === 'cross';
    const info = blocked && LAB.views.expInfo ? LAB.views.expInfo() : null;
    const banner = blocked ? `
      <div class="blocked">
        <div class="ic">!</div>
        <div style="flex:1">
          <b>${t('실험 중이라 새 영상을 올릴 수 없습니다', 'New uploads are paused while an experiment runs')}</b>
          <p>${info ? t(`${info.id} ${info.exp}이(가) GPU를 쓰고 있습니다. 대기열 ${info.queue}건이 끝나면 기본 구성을 다시 올려 시연 상태로 돌아갑니다.`, `${info.id} (${info.exp}) is using the GPU. After ${info.queue} queued run(s), the default configuration is loaded again and the server returns to demo mode.`) : ''}
            ${t('실험 중에는 실험에서 고른 모델만 GPU에 올려, 지연 측정이 다른 요청과 섞이지 않게 합니다.', 'During an experiment only the models it uses are on the GPU, so latency measurements are not mixed with other requests.')}</p>
          <div class="row mt12"><span class="chip warn">${t('시연 상태로 돌아오기까지', 'Back to demo mode in about')} <span class="fake num">1:11:11</span></span>
            <span class="chip ok">${t('처리해 둔 영상의 재생 · 실시간 재현은 됩니다', 'Processed videos and replays still play')}</span></div>
        </div>
        <div class="col"><a class="btn" href="#/demo">${t('처리해 둔 영상 보기', 'Processed videos')}</a><a class="btn" href="#/status">${t('모델 · 서버 상태', 'Models & server')}</a></div>
      </div>` : '';
    return shell(`
      <div class="crumb"><a href="#/demo">${t('시연', 'Demo')}</a> › ${t('영상 올리기', 'Upload a video')}</div>
      <div class="page-head"><div><h1>${t('영상 올리기', 'Upload a video')}</h1><p>${t('녹화한 영상을 올리면 끝까지 처리한 뒤 재생 화면을 엽니다.', 'The video is processed to the end, then the player opens.')}</p></div></div>
      ${banner}
      <div class="grid g2 ${blocked ? 'disabled-area' : ''}">
        <div class="card card-pad">
          <h2>${t('영상', 'Video')}</h2>
          <div class="drop has mt12"><div class="ic">mp4</div><div style="flex:1"><b>회의_녹화_1124.mp4</b><div class="muted small num">${durText(252)} · 86 MB · 1920 × 1080</div></div><button class="btn sm">${t('바꾸기', 'Replace')}</button></div>
          <p class="help muted small mt8">${t('mp4 · 길이 10분, 용량 500 MB까지', 'mp4 · up to 10 minutes and 500 MB')}</p>
          <div class="field"><label>${t('영상의 언어', 'Language of the video')}</label>
            ${seg('lang', [['ko', t('한국어', 'Korean')], ['en', t('영어', 'English')], ['auto', t('자동', 'Auto')]])}</div>
          <div class="field"><label>${t('해설을 넣는 방식', 'Delivery mode')}</label>
            ${seg('mode', [['cross', t('교차 모드', 'Interleaved'), t('원음을 멈추고 해설을 넣음', 'pause the source, insert the description')], ['sync', t('동시 모드', 'Simultaneous'), t('원음과 해설을 좌우로 나눠 함께 재생', 'source and description split left / right')]])}</div>
          <div class="field" style="${isCross ? '' : 'opacity:.45;pointer-events:none'}"><label>${t('교차 모드 설정', 'Interleaved preset')}</label>
            ${seg('preset', [['quality', t('품질', 'Quality'), t('원음을 60초 늦춤', 'source delayed 60 s')], ['balanced', t('균형', 'Balanced'), t('원음을 10초 늦춤', 'source delayed 10 s')], ['speed', t('성능', 'Speed'), t('늦추지 않음', 'no delay')]])}
            <p class="help">${t('설정마다 원음을 늦춰 트는 시간이 다릅니다. 늦출수록 해설을 문장 끝에 맞춰 넣기 쉽습니다.', 'Each preset delays the source by a different amount. A longer delay makes it easier to place descriptions at sentence ends.')}</p></div>
        </div>
        <div class="card card-pad">
          <h2>${t('모델 구성', 'Model configuration')}</h2>
          <div class="opt ${custom ? '' : 'on'}" data-cfg="default"><i class="radio"></i><div><b>${t('기본 구성', 'Default configuration')} <span class="chip ok">${t('기다림 없음', 'No wait')}</span></b>
            <span>${t('판단 · 생성 모두 Gemma 4 26B-A4B · 4비트. 시연 상태에서 늘 올라와 있습니다.', 'Gemma 4 26B-A4B · 4-bit for both judging and generation. Always loaded in demo mode.')}</span></div></div>
          <div class="opt ${custom ? 'on' : ''}" data-cfg="custom"><i class="radio"></i><div><b>${t('다른 구성 고르기', 'Choose another configuration')} <span class="chip warn">${t('처리하는 동안 실험 상태로 바뀜', 'Server switches to experiment mode')}</span></b>
            <span>${t('기본 구성을 내리고 고른 구성만 올려 처리한 뒤 기본 구성을 다시 올립니다(앞뒤로 1 ~ 3분). 그동안 다른 사람은 새 영상을 올릴 수 없습니다.', 'The default configuration is unloaded, only the chosen one is loaded for this video, then the default is loaded again (1–3 min each way). Others cannot upload meanwhile.')}</span></div></div>
          <div style="${custom ? '' : 'opacity:.45;pointer-events:none'}">
            <div class="grid g2">
              <div class="field"><label>${t('판단 LLM', 'Judge LLM')}</label>${modelSelect('judge', u.judge)}</div>
              <div class="field"><label>${t('생성 VLM', 'Generation VLM')}</label>${modelSelect('vlm', u.vlm)}</div>
            </div>
            <div class="field"><label>${t('양자화', 'Quantization')}</label>
              ${seg('quant', QUANTS.map((q) => [q.id, t(q.ko, q.en), q.file + (q.sub[0] ? ' · ' + t(q.sub[0], q.sub[1]) : '')]))}</div>
            <p class="help muted small mt8">${t('모델 목록은 예시입니다. 평가 설계가 정해지면 바꿉니다.', 'The model list is an example and will follow the final evaluation design.')}</p>
          </div>
          <div class="note info mt16">${t('올린 영상과 처리 결과는 7일 뒤 저절로 지워집니다.', 'The upload and its results are deleted automatically after 7 days.')}</div>
          <div class="row mt16" style="justify-content:flex-end"><a class="btn" href="#/demo">${t('취소', 'Cancel')}</a>${blocked
            ? `<button class="btn primary lg" disabled>${t('실험 중 · 올릴 수 없음', 'Paused · experiment running')}</button>`
            : `<button class="btn primary lg" data-act="startproc">${custom ? t('처리 시작 · 실험 상태로 바꿈', 'Start · switch to experiment mode') : t('처리 시작', 'Start processing')}</button>`}</div>
        </div>
      </div>`);
  }

  /* ── 시연 › 처리 중 ───────────────── */
  const STEPS = [
    [['모델 준비', 'Prepare models'], ['고른 구성이 GPU에 올라와 있는지 확인', 'check that the chosen models are loaded']],
    [['영상 읽기 · 소리 분리', 'Read video · split audio'], ['화면은 2초마다 한 장, 소리는 3초 조각', 'one frame every 2 s, 3 s audio chunks']],
    [['음성 인식', 'Speech recognition'], ['조각마다 발화 자막 만들기', 'captions for every chunk']],
    [['트리거 찾기 · 판단', 'Triggers · judging'], ['화면이 있어야 뜻이 통하는 말인지 판단 LLM이 가림', 'the judge LLM decides whether the utterance needs the screen']],
    [['해설 생성 · 검증', 'Generation · verification'], ['VLM이 화면을 읽어 해설을 쓰고 화면 글자와 대조', 'the VLM writes a description and checks it against on-screen text']],
    [['음성 합성 · 끼워 넣기', 'Speech synthesis · insertion'], ['해설 음성을 만들어 원음 사이에 넣음', 'synthesize descriptions and insert them into the source audio']],
  ];
  function viewProcessing() {
    const pct = Math.round(S.proc.pct);
    const cur = Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length));
    const steps = STEPS.map((s, i) => {
      const st = pct >= 100 || i < cur ? 'done' : i === cur ? 'now' : '';
      return `<div class="step ${st}"><div class="n">${st === 'done' ? '✓' : i + 1}</div><div><b>${t(s[0][0], s[0][1])}</b><span>${t(s[1][0], s[1][1])}</span></div>
        <span class="chip ${st === 'done' ? 'ok' : st === 'now' ? 'blue' : ''}">${st === 'done' ? t('끝남', 'Done') : st === 'now' ? t('하는 중', 'Running') : t('기다림', 'Waiting')}</span></div>`;
    }).join('');
    const n = (v) => `<span class="fake num">${Math.round((v * pct) / 100)}</span>`;
    return shell(`
      <div class="crumb"><a href="#/demo">${t('시연', 'Demo')}</a> › ${t('처리 중', 'Processing')}</div>
      <div class="page-head"><div><h1>회의_녹화_1124.mp4</h1><p>${t('끝까지 처리한 뒤 재생 화면으로 넘어갑니다. 창을 닫아도 처리는 이어집니다.', 'The player opens when processing finishes. Processing continues even if you close this tab.')}</p></div>
        <span class="chip">${S.upload.config === 'default' ? t('기본 구성', 'Default configuration') : esc(modelName(S.upload.judge)) + ' · ' + quantName(S.upload.quant)} · ${S.upload.mode === 'cross' ? t('교차 모드', 'Interleaved') : t('동시 모드', 'Simultaneous')}</span></div>
      <div class="grid g2">
        <div class="card card-pad">
          <div class="row"><h2>${t('전체 진행', 'Overall progress')}</h2><span class="spacer"></span><b class="num" style="font-size:22px">${pct}%</b></div>
          <div class="bar mt12"><i style="width:${pct}%"></i></div>
          <div class="row mt12 small muted"><span>${t('지난 시간', 'Elapsed')} <b class="fake num">${mmss(pct * 710)}</b></span><span class="spacer"></span><span>${t('남은 시간', 'Remaining')} <b class="fake num">${mmss((100 - pct) * 710)}</b></span></div>
          <div class="grid g4 mt20">
            <div class="card stat"><span>${t('발화 조각', 'Speech chunks')}</span><b>${n(77)}</b></div>
            <div class="card stat"><span>${t('트리거 후보', 'Trigger candidates')}</span><b>${n(33)}</b></div>
            <div class="card stat"><span>${t('판단 O', 'Judged yes')}</span><b>${n(22)}</b></div>
            <div class="card stat"><span>${t('해설', 'Descriptions')}</span><b>${n(11)}</b></div>
          </div>
        </div>
        <div class="steps">${steps}</div>
      </div>`);
  }
  function startProcessing() {
    clearInterval(S.proc.timer);
    S.proc.pct = 0;
    go('/demo/processing');
    S.proc.timer = setInterval(() => {
      if (S.route !== '/demo/processing') return clearInterval(S.proc.timer);
      S.proc.pct = Math.min(100, S.proc.pct + 2.5);
      render();
      if (S.proc.pct >= 100) { clearInterval(S.proc.timer); setTimeout(() => { if (S.route === '/demo/processing') go('/demo/play'); }, 700); }
    }, 180);
  }

  /* ── 시연 › 재생 ──────────────────── */
  const TL = CLIP.timeline;
  const SRC_SEGS = TL.filter((x) => x.kind === 'source');
  // 실시간 재현은 발표자 쪽(원본 영상) 시각으로 흐른다. 원본 영상 + 원음을 틀고 처리 사건을 그 시각에 맞춰 띄운다.
  const isReplay = () => S.play.view === 'replay';
  const usesS = () => !isReplay() && (S.play.cond === 'demo' || S.play.cond === 'S');
  const screenHidden = () => !isReplay() && S.play.hide;
  function outToSrc(out) {
    for (let i = 0; i < TL.length; i++) {
      const x = TL[i];
      if (out < x.outEndMs || i === TL.length - 1) {
        if (x.kind === 'source') {
          const r = (x.srcEndMs - x.srcStartMs) / Math.max(1, x.outEndMs - x.outStartMs);
          return { src: x.srcStartMs + Math.max(0, out - x.outStartMs) * r, rate: r, seg: x };
        }
        const next = TL.slice(i).find((y) => y.kind === 'source');
        return { src: next ? next.srcStartMs : CLIP.srcDurMs, rate: 0, seg: x };
      }
    }
    return { src: CLIP.srcDurMs, rate: 0, seg: TL[TL.length - 1] };
  }
  function srcToOut(src) {
    for (const x of SRC_SEGS) {
      if (src <= x.srcEndMs) return x.outStartMs + Math.max(0, src - x.srcStartMs) * ((x.outEndMs - x.outStartMs) / Math.max(1, x.srcEndMs - x.srcStartMs));
    }
    return CLIP.outDurMs;
  }
  const P = { video: null, audio: null, raf: 0, pos: 0 };   // pos = 지금 조건의 시간축(ms)
  const total = () => (usesS() ? CLIP.outDurMs : CLIP.srcDurMs);
  const FAKE_LAT = [1.1, 2.2, 1.1, 3.3, 5.5, 1.1, 2.2, 1.1, 2.2];
  const FAKE_STEP = [[0.11, 0.77, 0.22], [0.22, 1.11, 0.33], [0.11, 2.22, 0.44], [0.22, 0.99, 0.33], [0.11, 0.88, 0.22], [0.33, 1.11, 0.22], [0.11, 0.77, 0.33], [0.22, 0.66, 0.22], [0.11, 0.99, 0.22]];
  LAB.FAKE_STEP = FAKE_STEP;   // 실시간 재현(replay.js)도 「처리 과정」 탭과 같은 가짜 시간을 쓴다

  function viewPlay() {
    const p = S.play;
    const condBtn = (id, a, b) => `<button data-cond="${id}" class="${p.cond === id ? 'on' : ''}">${a}<small>${b}</small></button>`;
    const tabs = [['ads', t('해설', 'Descriptions') + ' ' + CLIP.ads.length], ['process', t('처리 과정', 'Process')], ['time', t('처리 시간', 'Timing')], ['info', t('정보 · 내려받기', 'Info · download')]];
    const replay = isReplay();
    const viewBtn = (id, a, b) => `<button data-view="${id}" class="${p.view === id ? 'on' : ''}">${a}<small>${b}</small></button>`;
    return shell(`
      <div class="crumb"><a href="#/demo">${t('시연', 'Demo')}</a> › ${t('테스트 DB 클립', 'Test DB clip')} › ${CLIP.id}</div>
      <div class="page-head"><div><h1>${esc(CLIP.title)}</h1><p>${t(CLIP.source, 'KMA regular forecast briefing · 18 June 2026')} · <span class="num">${durText(Math.round(CLIP.srcDurMs / 1000))}</span></p></div>
        <div class="ph-right"><div class="row wrap"><span class="chip">${catName(CLIP.cat)}</span><span class="chip">${t('한국어', 'Korean')}</span><span class="chip blue">${t('기본 구성 · 교차 모드 · 균형', 'Default · interleaved · balanced')}</span></div>
          <div class="viewsw">${viewBtn('result', t('결과 보기', 'Result'), t('해설이 들어간 결과 재생', 'play the processed result'))}${viewBtn('replay', t('실시간 재현', 'Live replay'), t('처리 흐름을 1배속으로', 'pipeline events at 1×'))}</div></div></div>
      <div class="player ${replay ? 'replay' : ''}">
        <div>
          <div class="stage" id="stage">
            <video id="vid" src="${CLIP.video}" preload="auto" playsinline></video>
            <div class="cover"><div><div class="wave">${[0, .15, .3, .45, .6, .75, .9].map((d) => `<i style="animation-delay:${d}s"></i>`).join('')}</div><b>${t('화면 가림', 'Screen hidden')}</b><div class="small mt8">${t('소리만 듣는 조건입니다', 'Audio-only condition')}</div></div></div>
            <div class="adflag">▶ ${t('해설 재생 중 · 원음 멈춤', 'Description playing · source paused')}</div>
            <div class="bigplay" data-act="pp"><i></i></div>
          </div>
          <div class="caps">
            <div class="cap" id="capS"><span class="k">${t('발화 자막', 'Speech')}</span><span class="v" id="capSv"></span></div>
            <div class="cap ad" id="capA"><span class="k">${replay ? t('해설 · 듣는 쪽', 'Description · listener') : t('해설 자막', 'Description')}</span><span class="v" id="capAv"></span></div>
          </div>
          <div class="ctrl">
            <div class="line1"><button class="pp" id="pp" data-act="pp" aria-label="play"></button><span class="time num" id="tm">0:00 / 0:00</span>
              <div class="seek" id="seek"><div class="track"></div><div class="fill" id="fill"></div><span id="segs"></span><div class="knob" id="knob"></div></div></div>
            <div class="legend"><span><i class="src"></i>${t('원음', 'Source audio')}</span><span><i></i>${t('해설이 들어간 자리', 'Inserted descriptions')}</span><span class="spacer"></span><span id="lenNote"></span></div>
            ${replay ? `<div class="line2">
              <div class="clocks"><span>${t('발표자', 'Speaker')} <b class="num" id="clkSrc">0:00</b></span><span>${t('듣는 사람', 'Listener')} <b class="num" id="clkLis">0:00</b></span>
                <small>${t('교차 모드 · 균형은 듣는 쪽 원음을 10초 늦춥니다', 'Interleaved · balanced delays the listener by 10 s')}</small></div>
              <span class="spacer"></span>
              <span class="tog ${p.speechCap ? 'on' : ''}" data-tog="speechCap"><i></i>${t('발화 자막', 'Speech captions')}</span>
              <span class="tog ${p.adCap ? 'on' : ''}" data-tog="adCap"><i></i>${t('해설 자막', 'Description captions')}</span>
            </div>` : `<div class="line2">
              <div class="cond">
                ${condBtn('demo', t('시연 보기', 'Demo view'), t('화면 + 소리 + 해설', 'screen + audio + descriptions'))}
                ${condBtn('A', t('조건 A', 'Condition A'), t('소리만', 'audio only'))}
                ${condBtn('S', t('조건 S', 'Condition S'), t('소리 + 해설', 'audio + descriptions'))}
                ${condBtn('C', t('조건 C', 'Condition C'), t('화면 + 소리', 'screen + audio'))}
              </div>
              <span class="spacer"></span>
              <span class="tog ${p.hide ? 'on' : ''}" data-tog="hide"><i></i>${t('화면 가리기', 'Hide screen')}</span>
              <span class="tog ${p.speechCap ? 'on' : ''}" data-tog="speechCap"><i></i>${t('발화 자막', 'Speech captions')}</span>
              <span class="tog ${p.adCap ? 'on' : ''}" data-tog="adCap"><i></i>${t('해설 자막', 'Description captions')}</span>
            </div>`}
          </div>
        </div>
        ${replay ? LAB.replay.panelHtml() : `<aside class="card side">
          <div class="tabs">${tabs.map(([id, l]) => `<button data-tab="${id}" class="${p.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="tabbody" id="tabbody">${playTab()}</div>
        </aside>`}
      </div>`);
  }
  function markAnchor(utter, anchor) {
    const u = esc(utter || '');
    return anchor && u.includes(esc(anchor)) ? u.replace(esc(anchor), `<mark>${esc(anchor)}</mark>`) : u;
  }
  function playTab() {
    const tab = S.play.tab;
    if (tab === 'ads') {
      return CLIP.ads.map((a) => `<div class="aditem" data-ad="${a.no}">
        <div class="h"><b class="num">${mmss(a.eventMs)}</b><span class="chip blue">${adKind(a.type)}</span><span class="chip">${typeName(a.sub)}</span><span class="spacer"></span><span class="num">${((a.outEndMs - a.outStartMs) / 1000).toFixed(1)}${t('초', ' s')}</span></div>
        <div class="tx">${esc(a.text)}</div><div class="ut">${t('근거 발화', 'Trigger')}: “${markAnchor(a.utter, a.anchor)}”</div></div>`).join('') +
        `<p class="muted small">${t('해설 문장과 위치는 2026년 10월 실행 결과 그대로입니다. 줄을 누르면 그 자리로 갑니다.', 'Sentences and positions come from the October 2026 run. Click a row to jump there.')}</p>`;
    }
    if (tab === 'process') {
      const rows = [];
      CLIP.ads.forEach((a, i) => rows.push({ ms: a.eventMs, type: typeName(a.sub), utter: markAnchor(a.utter, a.anchor), o: true, res: 'play', text: a.text, st: FAKE_STEP[i] }));
      CLIP.dropped.filter((d) => d.reason === 'rate-limited').forEach((d) => rows.push({ ms: d.eventMs, type: typeName(d.cls === 'deixis' ? 'adj' : 'scale'), utter: '', o: true, res: 'rate', text: d.text, st: [0.22, 1.11, null] }));
      rows.push({ ms: 52200, type: typeName('value_to_meaning'), utter: '33도까지 찍은 것도 있었고', o: false, res: 'x', why: t('값의 뜻(기온)이 발화에 있음', 'the meaning of the value (temperature) is spoken'), st: [0.11, null, null], ex: true });
      rows.push({ ms: 74200, type: typeName('adj'), utter: '강릉의 기온 시계를 보시면 평년보다도 낮은 기온', o: true, res: 'none', why: t('화면 글자와 맞지 않아 검증에서 걸러짐', 'rejected by verification against on-screen text'), st: [0.22, 2.22, null], ex: true });
      rows.push({ ms: 80200, type: typeName('claim_to_value'), utter: '다음 주 날씨입니다. 일단 뚜렷한 비는 들어가 있지 않지만', o: false, res: 'x', why: t('화면 없이도 뜻이 통함', 'understandable without the screen'), st: [0.11, null, null], ex: true });
      rows.sort((a, b) => a.ms - b.ms);
      const resChip = (r) => r.res === 'play' ? `<span class="chip ok">${t('재생됨', 'Played')}</span>`
        : r.res === 'rate' ? `<span class="chip warn">${t('해설 안 함 · 간격 제한', 'Skipped · rate limit')}</span>`
        : r.res === 'none' ? `<span class="chip warn">${t('해설 안 함 · 검증 탈락', 'Skipped · verification')}</span>`
        : `<span class="chip">${t('해설 안 함', 'Skipped')}</span>`;
      const f = (v) => (v == null ? '—' : `<span class="fake num">${v.toFixed(2)}</span>`);
      return `<div class="funnel">
          <div><b class="fake num">33</b><span>${t('트리거 후보', 'Candidates')}</span></div><div><b class="fake num">22</b><span>${t('판단 O', 'Judged yes')}</span></div>
          <div><b class="num">11</b><span>${t('생성', 'Generated')}</span></div><div><b class="num">9</b><span>${t('재생', 'Played')}</span></div></div>
        <p class="muted small mt8">${t('후보마다 판단 결과와, 해설을 하지 않았다면 그 까닭을 보여 줍니다. 「예시」 표시 줄은 만든 값입니다.', 'Each candidate shows the judgement and, if skipped, the reason. Rows marked “example” are made up.')}</p>
        <div class="mt12">${rows.map((r) => `<div class="aditem" style="cursor:default">
          <div class="h"><b class="num">${mmss(r.ms)}</b><span class="chip">${r.type}</span><span class="chip ${r.o ? 'blue' : ''}">${t('판단', 'Judge')} ${r.o ? 'O' : 'X'}</span>${resChip(r)}${r.ex ? `<span class="chip warn">${t('예시', 'example')}</span>` : ''}</div>
          ${r.utter ? `<div class="ut">“${r.utter}”</div>` : ''}
          <div class="tx" style="font-weight:600">${r.text ? esc(r.text) : `<span class="muted">${r.why}</span>`}</div>
          <div class="ut num">${t('판단', 'judge')} ${f(r.st[0])}${t('초', ' s')} · ${t('생성', 'generation')} ${f(r.st[1])}${r.st[1] == null ? '' : t('초', ' s')} · ${t('합성', 'TTS')} ${f(r.st[2])}${r.st[2] == null ? '' : t('초', ' s')}</div></div>`).join('')}</div>`;
    }
    if (tab === 'time') {
      const svc = [
        [t('음성 인식', 'Speech recognition'), 55, 0.22, 0.99], [t('판단', 'Judging'), 22, 0.44, 0.66], [t('해설 생성', 'Generation'), 33, 0.77, 4.44],
        [t('화면 글자 확인', 'On-screen text check'), 11, 0.88, 3.33], [t('음성 합성', 'Speech synthesis'), 11, 0.55, 0.99],
      ];
      return `<div class="grid g2">
          <div class="card stat"><span>${t('전체 처리 시간', 'Total processing time')}</span><b class="fake num">1:11</b></div>
          <div class="card stat"><span>${t('영상 길이 대비', 'Versus video length')}</span><b class="fake num">2.22<small>${t('배 빠름', '× faster')}</small></b></div></div>
        <h2 class="mt16" style="font-size:14px">${t('단계별', 'By stage')}</h2>
        <table class="mini mt8"><thead><tr><th>${t('단계', 'Stage')}</th><th class="r">${t('호출', 'Calls')}</th><th class="r">${t('중앙값', 'Median')}</th><th class="r">${t('최댓값', 'Max')}</th></tr></thead><tbody>
          ${svc.map((r) => `<tr><td>${r[0]}</td><td class="r num"><span class="fake">${r[1]}</span></td><td class="r num"><span class="fake">${r[2].toFixed(2)}</span>${t('초', ' s')}</td><td class="r num"><span class="fake">${r[3].toFixed(2)}</span>${t('초', ' s')}</td></tr>`).join('')}</tbody></table>
        <h2 class="mt16" style="font-size:14px">${t('해설 한 건마다 · 발화가 끝난 때 → 해설이 시작된 때', 'Per description · end of utterance → start of description')}</h2>
        ${CLIP.ads.map((a, i) => `<div class="lat"><span class="num muted">${a.no}</span><div class="b"><i style="width:${FAKE_LAT[i] * 16}%"></i></div><span class="num r"><span class="fake">${FAKE_LAT[i].toFixed(1)}</span>${t('초', ' s')}</span></div>`).join('')}
        <p class="muted small mt12">${t('이 탭의 시간 값은 모두 가짜입니다.', 'All timing values in this tab are fake.')}</p>`;
    }
    return `<dl class="kv">
        <dt>${t('판단 LLM', 'Judge LLM')}</dt><dd>Gemma 4 26B-A4B · ${t('4비트', '4-bit')}</dd>
        <dt>${t('생성 VLM', 'Generation VLM')}</dt><dd>Gemma 4 26B-A4B · ${t('4비트', '4-bit')}</dd>
        <dt>${t('전달 모드', 'Delivery')}</dt><dd>${t('교차 모드 · 균형', 'Interleaved · balanced')}</dd>
        <dt>${t('언어', 'Language')}</dt><dd>${t('한국어', 'Korean')}</dd>
        <dt>${t('해설', 'Descriptions')}</dt><dd class="num">${CLIP.ads.length}${t('개', '')} · ${(CLIP.adTotalMs / 1000).toFixed(1)}${t('초', ' s')}</dd>
        <dt>${t('처리한 때', 'Processed')}</dt><dd class="num">2026-11-24 14:22</dd>
        <dt>${t('보관', 'Retention')}</dt><dd>${t('테스트 DB 클립 · 지우지 않음', 'Test DB clip · kept')}</dd></dl>
      <h2 class="mt20" style="font-size:14px">${t('내려받기', 'Download')}</h2>
      <div class="row wrap mt8"><button class="btn sm" data-act="dl">${t('해설 목록', 'Description list')} (json)</button><button class="btn sm" data-act="dl">${t('해설 목록', 'Description list')} (csv)</button><button class="btn sm" data-act="dl">${t('해설이 들어간 음성', 'Audio with descriptions')} (mp3)</button></div>
      <div class="note mt16">${t('이 클립은 평가 전용입니다. 로그인한 사람에게만 보이고 밖에 공개하지 않습니다.', 'This clip is for evaluation only. It is visible to signed-in users and is not shown publicly.')}</div>`;
  }

  function playerMount() {
    P.video = $('#vid'); if (!P.video) return;
    if (!P.audio) { P.audio = new Audio(CLIP.audioS); P.audio.preload = 'auto'; }
    P.video.muted = usesS();
    cancelAnimationFrame(P.raf);
    drawSegs();
    const stage = $('#stage');
    stage.classList.toggle('hidden-screen', screenHidden());
    if (S.q.t != null && !P.seeded) { P.pos = Number(S.q.t) * 1000; P.seeded = true; }
    if (P.pos > 0) stage.classList.add('started');
    seek(P.pos, true);
    const tick = () => { if (!$('#vid')) return; syncClock(); paint(); P.raf = requestAnimationFrame(tick); };
    P.raf = requestAnimationFrame(tick);
    $('#seek').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * total()); });
    P.audio.onended = P.video.onended = () => { pause(); };
  }
  function drawSegs() {
    const el = $('#segs'); if (!el) return;
    const T = total();
    el.innerHTML = usesS()
      ? TL.filter((x) => x.kind === 'ad').map((x) => `<i class="adseg" style="left:${(x.outStartMs / T) * 100}%;width:${((x.outEndMs - x.outStartMs) / T) * 100}%"></i>`).join('')
      : CLIP.ads.map((a) => `<i class="adseg dim" style="left:${(a.eventMs / T) * 100}%;width:.5%"></i>`).join('');
    $('#lenNote').textContent = isReplay()
      ? t('실시간 재현 · 원본 영상 시각으로 흐름 · 테두리 표시는 해설을 부른 발화 자리', 'Live replay · runs on the original video clock · outlines mark triggering utterances')
      : usesS()
        ? t(`해설 ${CLIP.ads.length}개 · 해설 뒤에는 원음을 조금 빠르게 틀어 길이를 맞춤`, `${CLIP.ads.length} descriptions · the source plays slightly faster afterwards to keep the length`)
        : t('이 조건에는 해설이 없습니다 · 테두리 표시는 해설이 들어갈 자리', 'No descriptions in this condition · outlines mark where they would go');
  }
  const playing = () => (usesS() ? P.audio && !P.audio.paused : P.video && !P.video.paused);
  function play() {
    $('#stage').classList.add('started');
    if (usesS()) { P.audio.play().catch(() => {}); } else { P.audio.pause(); P.video.playbackRate = 1; P.video.play().catch(() => {}); }
  }
  function pause() { if (P.audio) P.audio.pause(); if (P.video) P.video.pause(); }
  function seek(ms, silent) {
    P.pos = Math.max(0, Math.min(total() - 50, ms));
    if (usesS()) { try { P.audio.currentTime = P.pos / 1000; } catch (e) { /* 아직 못 읽음 */ } const m = outToSrc(P.pos); try { P.video.currentTime = m.src / 1000; } catch (e) { /* 아직 못 읽음 */ } }
    else { try { P.video.currentTime = P.pos / 1000; } catch (e) { /* 아직 못 읽음 */ } }
    if (!silent) $('#stage').classList.add('started');
    paint();
  }
  function syncClock() {
    if (!P.video) return;
    if (usesS()) {
      P.video.muted = true;
      if (!P.audio.paused) P.pos = P.audio.currentTime * 1000;
      const m = outToSrc(P.pos);
      if (m.seg.kind === 'source' && !P.audio.paused) {
        P.video.playbackRate = Math.max(0.5, Math.min(2, m.rate || 1));
        if (Math.abs(P.video.currentTime * 1000 - m.src) > 350) P.video.currentTime = m.src / 1000;
        if (P.video.paused) P.video.play().catch(() => {});
      } else if (!P.video.paused) { P.video.pause(); }
    } else {
      P.video.muted = false;
      if (!P.video.paused) P.pos = P.video.currentTime * 1000;
    }
  }
  function paint() {
    const stage = $('#stage'); if (!stage) return;
    const T = total();
    const srcMs = usesS() ? outToSrc(P.pos).src : P.pos;
    const seg = usesS() ? outToSrc(P.pos).seg : null;
    const liveAd = seg && seg.kind === 'ad' ? CLIP.ads[seg.adRef - 1] : null;
    $('#fill').style.width = (P.pos / T) * 100 + '%';
    $('#knob').style.left = (P.pos / T) * 100 + '%';
    $('#tm').textContent = mmss(P.pos) + ' / ' + mmss(T);
    $('#pp').classList.toggle('on', !!playing());
    stage.classList.toggle('playing', !!playing());
    stage.classList.toggle('paused', !playing());
    stage.classList.toggle('in-ad', !!liveAd && !screenHidden());
    const sp = CLIP.speech.filter((x) => x.s <= srcMs + 1).pop();
    const capS = $('#capS'), capA = $('#capA');
    capS.classList.toggle('off', !S.play.speechCap); capA.classList.toggle('off', !S.play.adCap);
    $('#capSv').textContent = sp && srcMs < sp.e + 1500 ? sp.text : '';
    const av = $('#capAv');
    if (isReplay()) {
      // 듣는 쪽은 원음을 10초 늦춰 들으므로, 해설은 출력 시각 + 10초에 들린다
      const lis = CLIP.ads.find((a) => P.pos >= a.outStartMs + 10000 && P.pos < a.outEndMs + 10000);
      if (lis) { av.textContent = lis.text; av.className = 'v'; capA.classList.add('live'); }
      else { av.textContent = t('해설이 듣는 쪽에서 재생되면 여기에 보입니다', 'Shown here when the listener hears a description'); av.className = 'v idle'; capA.classList.remove('live'); }
      const cs = $('#clkSrc'), cl = $('#clkLis');
      if (cs) { cs.textContent = mmss(P.pos); cl.textContent = mmss(Math.max(0, P.pos - 10000)); }
      if (LAB.replay) LAB.replay.paint(P.pos, !!playing());
    } else if (!usesS()) { av.textContent = t('이 조건에는 해설이 없습니다', 'No descriptions in this condition'); av.className = 'v idle'; capA.classList.remove('live'); }
    else if (liveAd) { av.textContent = liveAd.text; av.className = 'v'; capA.classList.add('live'); }
    else {
      const next = CLIP.ads.find((a) => a.outStartMs > P.pos);
      av.textContent = next ? t(`다음 해설까지 ${Math.ceil((next.outStartMs - P.pos) / 1000)}초`, `Next description in ${Math.ceil((next.outStartMs - P.pos) / 1000)} s`) : t('남은 해설이 없습니다', 'No more descriptions');
      av.className = 'v idle'; capA.classList.remove('live');
    }
    if (S.play.tab === 'ads') $$('#tabbody .aditem').forEach((n) => n.classList.toggle('live', !!liveAd && Number(n.dataset.ad) === liveAd.no));
  }
  function setCond(c) {
    const was = usesS(); const wasPlaying = playing();
    const srcNow = was ? outToSrc(P.pos).src : P.pos;
    pause();
    S.play.cond = c;
    S.play.hide = c === 'A' || c === 'S';
    P.pos = usesS() ? srcToOut(srcNow) : srcNow;
    render();
    if (wasPlaying) play();
  }
  function setView(v) {
    const wasPlaying = playing();
    const srcNow = usesS() ? outToSrc(P.pos).src : P.pos;
    pause();
    S.play.view = v;
    P.pos = usesS() ? srcToOut(srcNow) : srcNow;
    render();
    if (wasPlaying) play();
  }

  /* ── 그리기 · 이벤트 ──────────────── */
  function render() {
    const r = S.route;
    const leavingPlay = !r.startsWith('/demo/play');
    if (leavingPlay) { pause(); cancelAnimationFrame(P.raf); }
    let html;
    if (r === '/demo') html = viewDemoHome();
    else if (r === '/demo/upload') html = viewUpload();
    else if (r === '/demo/processing') html = viewProcessing();
    else if (r === '/demo/play') html = viewPlay();
    else if (r.startsWith('/run')) html = S.login ? LAB.views.run(shell, r) : shell(gate(t('실험 실행', 'Run experiments')));
    else if (r === '/compare') html = S.login ? LAB.views.compare(shell) : shell(gate(t('결과 비교', 'Compare results')));
    else if (r === '/status') html = S.login ? LAB.views.status(shell) : shell(gate(t('모델 · 서버 상태', 'Models & server')));
    else if (r === '/about') html = LAB.views.about(shell);
    else html = viewDemoHome();
    $('#app').innerHTML = html;
    if (r === '/demo/play') playerMount();
    if (LAB.views.afterRender) LAB.views.afterRender(r);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go],[data-lang],[data-act],[data-clip],[data-seg] button,[data-cfg],[data-view],[data-cond],[data-tog],[data-tab],[data-ad]');
    if (!el) return;
    if (el.dataset.go) return go(el.dataset.go);
    if (el.dataset.lang) { S.lang = el.dataset.lang; return render(); }
    if (el.dataset.clip) return el.dataset.clip === CLIP.id ? go('/demo/play') : toast(t('목업에서는 「기상청 정례 예보 브리핑 6월 18일」 클립만 재생됩니다.', 'Only the “KMA briefing, 18 June” clip plays in this mockup.'));
    if (el.dataset.cfg) { S.upload.config = el.dataset.cfg; return render(); }
    if (el.dataset.view) return setView(el.dataset.view);
    if (el.dataset.cond) return setCond(el.dataset.cond);
    if (el.dataset.tog) { S.play[el.dataset.tog] = !S.play[el.dataset.tog]; const pl = playing(); render(); if (pl) play(); return; }
    if (el.dataset.tab) { S.play.tab = el.dataset.tab; $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.play.tab)); $('#tabbody').innerHTML = playTab(); return paint(); }
    if (el.dataset.ad) { const a = CLIP.ads[Number(el.dataset.ad) - 1]; seek(usesS() ? a.outStartMs - 2500 : a.eventMs - 2500); return play(); }
    if (el.closest('[data-seg]')) { S.upload[el.closest('[data-seg]').dataset.seg] = el.dataset.v; return render(); }
    switch (el.dataset.act) {
      case 'login': return openLogin();
      case 'logout': S.login = false; return render();
      case 'upload': return needLogin(() => go('/demo/upload'));
      case 'startproc': return startProcessing();
      case 'example': return toast(t('목업에서는 「기상청 정례 예보 브리핑 6월 18일」 클립만 재생됩니다.', 'Only the “KMA briefing, 18 June” clip plays in this mockup.'));
      case 'openclip': return go('/demo/play');
      case 'openproc': S.proc.pct = 44; return go('/demo/processing');
      case 'pp': return playing() ? pause() : play();
      case 'dl': return toast(t('목업에서는 파일을 내려받지 않습니다.', 'Downloads are disabled in this mockup.'));
      default: if (LAB.views.onAct) LAB.views.onAct(el.dataset.act, el);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.sel && S.upload[el.dataset.sel] !== undefined) S.upload[el.dataset.sel] = el.value;
    if (LAB.views.onChange) LAB.views.onChange(el);
  });
  window.addEventListener('hashchange', () => { parseHash(); if (S.q.p != null) S.proc.pct = Number(S.q.p); render(); window.scrollTo(0, 0); });
  window.addEventListener('DOMContentLoaded', () => {
    parseHash();
    if (S.q.p != null) S.proc.pct = Number(S.q.p);
    if (S.q.cond) { S.play.cond = S.q.cond; S.play.hide = S.q.cond === 'A' || S.q.cond === 'S'; }
    if (S.q.tab) S.play.tab = S.q.tab;
    if (S.q.view) S.play.view = S.q.view;
    if (LAB.views.init) LAB.views.init();
    render();
  });
})();
