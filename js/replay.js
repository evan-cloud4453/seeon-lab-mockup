/* SEEON Lab 목업 — 재생 화면의 「실시간 재현」 보기.
   영상 처리 도구는 가상 시계(seeon-metricsDB src/clock/virtual-clock.mjs)를 써서, 서비스 호출 동안은 실제 시간대로 흐르고
   할 일이 없는 구간만 건너뛴다. 그래서 처리 기록의 사건 시각이 실제로 틀었을 때와 같다. 이 보기는 그 기록을 영상과 맞춰
   1배속으로 흘리며, 사건이 생길 때마다 Electron 개발자 흐름 창(seeon-meet src/renderer/dev-flow/flow.html)과 같은 모양으로 쌓는다.
   목업의 사건은 data.js 의 RK-S06-C1 해설 · 버려진 해설로 만든다. 해설 문장 · 사건 자리는 실제 결과이고, 걸린 시간은 가짜 값이다.
   「예시」 표시 카드(판단 X · 검증 탈락)는 만든 것이다. */
(function () {
  'use strict';
  const LAB = window.LAB;
  const { t, esc, mmss } = LAB;
  const CLIP = window.LAB_CLIP;
  const DELAY_MS = 10000;      // 교차 모드 · 균형: 듣는 쪽 원음을 10초 늦춘다
  const ASR_MS = 220;          // 발화 조각이 끝난 뒤 전사가 나오기까지(가짜)
  const OCR_S = 0.33;          // 화면 글자 읽기(가짜)
  const RECENT_MS = 3000;      // 신호등이 결과 색으로 남아 있는 시간(흐름 창과 같음)

  const KIND = { input: ['입력', 'input'], trigger: ['트리거', 'trigger'], judge: ['판정', 'judge'], agent: ['에이전트', 'agent'], post: ['후처리', 'post'], output: ['출력', 'output'] };
  const TYPE = {
    deixis: ['지시 대상', 'Referent'],
    interpretation: ['발화 기반(수치·변화)', 'Speech-based (value/change)'],
    visual_description: ['발화 기반(척도)', 'Speech-based (scale)'],
  };
  const AGENT = {
    deixis: ['지시 대상 설명 에이전트', 'Referent agent'],
    interpretation: ['발화 기반 설명 에이전트', 'Speech-based agent'],
    visual_description: ['발화 기반 설명 에이전트', 'Speech-based agent'],
  };
  const OUT = { played: ['재생됨', 'Played'], dropped: ['버려짐', 'Dropped'], blocked: ['막힘', 'Blocked'], pending: ['진행 중', 'Running'] };
  const MARK = { pass: '✓', skip: '↷', fail: '✕', info: '•', run: '…' };
  const TRACKS = [
    ['asr', ['ASR', 'ASR']], ['page', ['페이지 전환', 'Page change']], ['judge', ['지시·발화 판단', 'Judging']],
    ['silence', ['무발화', 'Silence']], ['vlm', ['VLM 생성', 'VLM generation']], ['output', ['TTS·재생', 'TTS · playback']],
  ];
  const L = (pair) => t(pair[0], pair[1]);
  const sec = (s) => `${s.toFixed(2)}${t('초', ' s')}`;
  const speechAt = (ms) => CLIP.speech.find((x) => x.s <= ms && ms < x.e + 300) || CLIP.speech.filter((x) => x.s <= ms).pop();

  /* ── 사건 만들기 ──────────────────── */
  // 단계 하나 = { at: 끝난 시각, start: 시작 시각(호출 중이면 신호등이 파랗다), kind, label, mark, detail, track }
  function buildFlows() {
    const FAKE = LAB.FAKE_STEP;
    const flows = [];
    CLIP.ads.forEach((a, i) => {
      const [js, gs, ts] = FAKE[i];
      const t0 = a.eventMs + ASR_MS;
      const t1 = t0 + js * 1000;
      const hasOcr = a.calls.includes('ocr');
      const t2 = hasOcr ? t1 + OCR_S * 1000 : t1;
      const t3 = t2 + gs * 1000;
      const t4 = t3 + ts * 1000;
      const play = a.outStartMs + DELAY_MS;
      const steps = [
        { at: t0, start: a.eventMs, kind: 'trigger', label: ['트리거 후보(형태소 분석)', 'Trigger candidate'], mark: 'pass', detail: [`트리거="${a.anchor}"`, `trigger="${a.anchor}"`], track: 'judge' },
        { at: t1, start: t0, kind: 'judge', label: ['LLM 판단(통합 라우터)', 'LLM judge (router)'], mark: 'pass', detail: [`O · ${TYPE[a.type][0]} · ${sec(js)}`, `yes · ${TYPE[a.type][1]} · ${sec(js)}`], track: 'judge' },
      ];
      if (hasOcr) steps.push({ at: t2, start: t1, kind: 'input', label: ['화면 글자 읽기(OCR)', 'Screen text (OCR)'], mark: 'info', detail: [`슬라이드 ${a.slide} · ${sec(OCR_S)}`, `slide ${a.slide} · ${sec(OCR_S)}`], track: 'vlm' });
      steps.push(
        { at: t3, start: t2, kind: 'agent', label: AGENT[a.type], mark: 'pass', detail: [`"${a.text}" · ${sec(gs)}`, `"${a.text}" · ${sec(gs)}`], track: 'vlm' },
        { at: t4, start: t3, kind: 'output', label: ['TTS 합성', 'TTS'], mark: 'pass', detail: [sec(ts), sec(ts)], track: 'output' },
        { at: play, start: t4, ts: play, end: a.outEndMs + DELAY_MS, kind: 'output', label: ['재생', 'Playback'], mark: 'pass',
          wait: [`재생 대기 · 듣는 쪽이 ${mmss(play)}에 이 자리에 옴`, `waiting · the listener reaches this point at ${mmss(play)}`],
          detail: [`듣는 쪽 ${mmss(play)} · ${((a.outEndMs - a.outStartMs) / 1000).toFixed(1)}초 · 그동안 원음 멈춤`, `listener ${mmss(play)} · ${((a.outEndMs - a.outStartMs) / 1000).toFixed(1)} s · source paused`], track: 'output' },
      );
      flows.push({ id: 'ad' + a.no, eventMs: a.eventMs, decideMs: t1, type: a.type, text: a.text, final: 'played', steps });
    });
    // 간격 제한으로 버려진 해설(실제 결과의 droppedList). 걸린 시간은 「처리 과정」 탭과 같은 가짜 값이다.
    CLIP.dropped.filter((d) => d.reason === 'rate-limited').forEach((d, k) => {
      const type = d.cls === 'deixis' ? 'deixis' : 'visual_description';
      const sp = speechAt(d.eventMs);
      const t0 = d.eventMs + ASR_MS, t1 = t0 + 220, t2 = t1 + 1110;
      flows.push({ id: 'drop' + k, eventMs: d.eventMs, decideMs: t1, type, text: d.text, final: 'dropped', steps: [
        { at: t0, start: d.eventMs, kind: 'trigger', label: ['트리거 후보(형태소 분석)', 'Trigger candidate'], mark: 'pass', detail: [`근거="${sp ? sp.text.slice(0, 22) : ''}…"`, `utterance="${sp ? sp.text.slice(0, 22) : ''}…"`], track: 'judge' },
        { at: t1, start: t0, kind: 'judge', label: ['LLM 판단(통합 라우터)', 'LLM judge (router)'], mark: 'pass', detail: [`O · ${TYPE[type][0]} · ${sec(0.22)}`, `yes · ${TYPE[type][1]} · ${sec(0.22)}`], track: 'judge' },
        { at: t2, start: t1, kind: 'agent', label: AGENT[type], mark: 'pass', detail: [`"${d.text}" · ${sec(1.11)}`, `"${d.text}" · ${sec(1.11)}`], track: 'vlm' },
        { at: t2 + 10, start: t2, kind: 'post', label: ['중복·간격 억제', 'Duplicate / rate limit'], mark: 'skip', detail: ['비슷한 해설이 방금 나가 간격 억제', 'a similar description just played'], track: 'output', reason: ['간격 억제', 'rate limit'] },
      ] });
    });
    // 예시(만든 사건): 판단 X 두 건과 검증 탈락 한 건. 「처리 과정」 탭의 예시 줄과 같다.
    const ex = (ms, type, trig, steps) => ({ id: 'ex' + ms, eventMs: ms, decideMs: ms + ASR_MS + 110, type, text: '', final: 'blocked', example: true,
      steps: [{ at: ms + ASR_MS, start: ms, kind: 'trigger', label: ['트리거 후보(형태소 분석)', 'Trigger candidate'], mark: 'pass', detail: [`트리거="${trig}"`, `trigger="${trig}"`], track: 'judge' }, ...steps] });
    flows.push(ex(52200, 'interpretation', '33도', [
      { at: 52200 + ASR_MS + 110, start: 52200 + ASR_MS, kind: 'judge', label: ['LLM 판단(통합 라우터)', 'LLM judge (router)'], mark: 'skip', detail: [`X · 값의 뜻(기온)이 발화에 있음 · ${sec(0.11)}`, `no · the meaning is spoken · ${sec(0.11)}`], track: 'judge', reason: ['판단 X', 'judged no'] },
    ]));
    const v0 = 74200 + ASR_MS;
    flows.push(ex(74200, 'deixis', '낮은 기온', [
      { at: v0 + 220, start: v0, kind: 'judge', label: ['LLM 판단(통합 라우터)', 'LLM judge (router)'], mark: 'pass', detail: [`O · 지시 대상 · ${sec(0.22)}`, `yes · referent · ${sec(0.22)}`], track: 'judge' },
      { at: v0 + 220 + 2220, start: v0 + 220, kind: 'agent', label: AGENT.deixis, mark: 'pass', detail: [`"강릉 최저 기온 13도" · ${sec(2.22)}`, `"Gangneung low 13 °C" · ${sec(2.22)}`], track: 'vlm' },
      { at: v0 + 220 + 2220 + 110, start: v0 + 220 + 2220, kind: 'post', label: ['값 존재 검사', 'Value check'], mark: 'fail', detail: ['화면 글자에 13이 없어 버림', '13 is not on screen · rejected'], track: 'output', reason: ['검증 탈락', 'failed verification'] },
    ]));
    flows.push(ex(80200, 'interpretation', '뚜렷한 비', [
      { at: 80200 + ASR_MS + 110, start: 80200 + ASR_MS, kind: 'judge', label: ['LLM 판단(통합 라우터)', 'LLM judge (router)'], mark: 'skip', detail: [`X · 화면 없이도 뜻이 통함 · ${sec(0.11)}`, `no · clear without the screen · ${sec(0.11)}`], track: 'judge', reason: ['판단 X', 'judged no'] },
    ]));
    flows.forEach((f) => { f.firstAt = f.steps[0].at; f.lastAt = f.steps[f.steps.length - 1].at; });
    return flows.sort((a, b) => a.firstAt - b.firstAt);
  }
  const FLOWS = buildFlows();
  const ASR = CLIP.speech.map((s) => ({ at: s.e + ASR_MS, start: s.e, text: s.text }));

  /* ── 패널 상태 ────────────────────── */
  const V = { hideType: new Set(), hideOut: new Set(), showAsr: true, sig: '', fresh: new Set(), seen: new Set() };

  function outcomeOf(f, now) {
    if (now < f.lastAt) return 'pending';
    return f.final;
  }

  function panelHtml() {
    V.sig = ''; V.seen = new Set(); V.userScrolled = false;
    const typeChips = Object.keys(TYPE).map((k) => `<button class="fp-chip ${V.hideType.has(k) ? 'off' : ''}" data-fp-type="${k}">${L(TYPE[k])}</button>`).join('');
    const outChips = Object.keys(OUT).map((k) => `<button class="fp-chip ${V.hideOut.has(k) ? 'off' : ''}" data-fp-out="${k}">${L(OUT[k])}</button>`).join('');
    return `<aside class="flowpanel" id="flowpanel">
      <header>
        <div class="fp-title"><span class="title">${t('파이프라인 흐름', 'Pipeline flow')}</span><span class="run-text" id="fpRun"></span></div>
        <div class="fp-tracks" id="fpTracks"></div>
        <div class="fp-filter">
          <div class="grp"><span>${t('유형', 'Type')}</span>${typeChips}</div>
          <div class="grp"><span>${t('결과', 'Result')}</span>${outChips}</div>
          <label><input type="checkbox" data-fp-asr ${V.showAsr ? 'checked' : ''}> ${t('발화 인식 줄 보기', 'Show ASR lines')}</label>
        </div>
      </header>
      <main class="fp-list" id="fpList"></main>
      <div class="fp-foot">${t('처리 기록을 영상과 맞춰 1배속으로 흘립니다. 재생바를 옮기면 그 시점까지의 사건을 다시 그립니다. 해설 문장 · 사건 자리는 실제 결과, 걸린 시간은 가짜 값입니다.', 'The processing record runs at 1× with the video. Seeking redraws everything up to that point. Sentences and positions are real; durations are fake.')}</div>
    </aside>`;
  }

  function stepRow(s, now) {
    const running = now < s.at;
    const det = running ? (s.wait ? L(s.wait) : t('진행 중', 'running')) : L(s.detail);
    return `<div class="fp-step ${running ? 'running' : ''}" title="${esc(L(s.label) + ' · ' + L(s.detail))}"><span class="k">${L(KIND[s.kind])}</span><span class="l">${esc(L(s.label))}</span>`
      + `<span class="m ${running ? 'run' : s.mark}">${MARK[running ? 'run' : s.mark]}</span><span class="d">${esc(det)}</span></div>`;
  }

  function cardHtml(f, now) {
    const o = outcomeOf(f, now);
    const shown = f.steps.filter((s) => s.at <= now);
    const next = f.steps.find((s) => s.at > now && s.start <= now);
    const last = shown[shown.length - 1];
    const otext = o === 'played' ? `"${f.text}"` : o === 'dropped' || o === 'blocked' ? `(${L(last.reason || ['', ''])})` : '';
    const clock = `<span class="fp-clock" title="${t('사건 시각(원본 영상)', 'event time (original video)')}">[${mmss(f.eventMs)}]</span>`
      + (now >= f.decideMs && mmss(f.decideMs) !== mmss(f.eventMs) ? `<span class="fp-dclock">${t('결정', 'decided')} ${mmss(f.decideMs)}</span>` : '');
    return `<div class="fp-card o-${o} ${V.fresh.has(f.id) ? 'fresh' : ''}">
      <div class="fp-head">${clock}<span class="fp-badge">${esc(L(TYPE[f.type]))}</span><span class="fp-badge o-${o}">${L(OUT[o])}</span>${f.example ? `<span class="fp-badge ex">${t('예시', 'example')}</span>` : ''}<span class="fp-otext">${esc(otext)}</span></div>
      <div class="fp-steps">${shown.map((s) => stepRow(s, now)).join('')}${next ? stepRow(next, now) : ''}</div>
    </div>`;
  }

  function trackHtml(now) {
    const all = [];
    FLOWS.forEach((f) => f.steps.forEach((s) => all.push(s)));
    ASR.forEach((a) => all.push({ at: a.at, start: a.start, track: 'asr', mark: 'pass', detail: [a.text, a.text] }));
    return TRACKS.map(([key, label]) => {
      const st = (s) => (s.ts != null ? s.ts : s.start);   // 재생 단계는 듣는 쪽이 그 자리에 올 때부터 신호등을 켠다
      const mine = all.filter((s) => s.track === key && st(s) <= now);
      let state = 'idle', det = key === 'page' ? t('기능 꺼짐', 'off') : '—';
      if (mine.length) {
        const latest = mine.reduce((a, b) => (st(b) >= st(a) ? b : a));
        det = now < latest.at ? t('진행 중', 'running') : L(latest.detail);
        if (now < latest.at || (latest.end && now < latest.end)) state = 'active';
        else if (now - latest.at <= RECENT_MS) state = latest.mark === 'info' ? 'pass' : latest.mark;
      }
      return `<div class="fp-track s-${state}" title="${esc(det)}"><div class="lbl"><span class="dot"></span><span>${L(label)}</span></div><div class="det">${esc(det)}</div></div>`;
    }).join('');
  }

  function paint(now, isPlaying) {
    const list = document.getElementById('fpList');
    if (!list) return;
    const visible = FLOWS.filter((f) => f.firstAt <= now);
    const counts = { played: 0, dropped: 0, blocked: 0, pending: 0 };
    visible.forEach((f) => { counts[outcomeOf(f, now)] += 1; });
    const runText = `${CLIP.id} · ${isPlaying ? t('재현 중', 'replaying') : t('멈춤', 'paused')} · ${t('흐름', 'flows')} ${visible.length}${t('개', '')} (${Object.keys(OUT).map((k) => `${L(OUT[k])} ${counts[k]}`).join(' · ')})`;
    const rt = document.getElementById('fpRun');
    if (rt.textContent !== runText) rt.textContent = runText;
    const tr = document.getElementById('fpTracks');
    const th = trackHtml(now);
    if (tr.dataset.h !== th) { tr.innerHTML = th; tr.dataset.h = th; }

    const shownFlows = visible.filter((f) => !V.hideType.has(f.type) && !V.hideOut.has(outcomeOf(f, now)));
    const items = shownFlows.map((f) => ({ at: f.firstAt, kind: 'flow', f }));
    if (V.showAsr) ASR.filter((a) => a.at <= now).forEach((a) => items.push({ at: a.at, kind: 'asr', a }));
    items.sort((x, y) => x.at - y.at || (x.kind === 'asr' ? -1 : 1));
    // 새로 나타난 카드는 잠깐 밝게
    V.fresh = new Set();
    visible.forEach((f) => { if (!V.seen.has(f.id)) { if (now - f.firstAt < 800) V.fresh.add(f.id); V.seen.add(f.id); } });
    for (const id of Array.from(V.seen)) if (!visible.find((f) => f.id === id)) V.seen.delete(id);
    const html = items.length
      ? items.map((it) => (it.kind === 'asr'
        ? `<div class="fp-asr" title="${esc(it.a.text)}">[${mmss(it.a.start)}] ASR ✓ ${esc(it.a.text)}</div>`
        : cardHtml(it.f, now))).join('')
      : `<div class="fp-empty">${t('재생하면 처리 사건이 여기에 쌓입니다', 'Press play: pipeline events stack up here')}</div>`;
    const sig = html.replace(/ fresh/g, '');
    if (sig === V.sig) return;
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
    V.sig = sig;
    list.innerHTML = html;
    if (nearBottom || !V.userScrolled) list.scrollTop = list.scrollHeight;
  }

  document.addEventListener('click', (e) => {
    const ty = e.target.closest('[data-fp-type]'); const ou = e.target.closest('[data-fp-out]');
    if (!ty && !ou) return;
    const set = ty ? V.hideType : V.hideOut; const key = ty ? ty.dataset.fpType : ou.dataset.fpOut;
    if (set.has(key)) set.delete(key); else set.add(key);
    (ty || ou).classList.toggle('off', set.has(key));
    V.sig = '';
  });
  document.addEventListener('change', (e) => { if (e.target.hasAttribute && e.target.hasAttribute('data-fp-asr')) { V.showAsr = e.target.checked; V.sig = ''; } });
  document.addEventListener('scroll', (e) => {
    const list = e.target;
    if (list && list.id === 'fpList') V.userScrolled = list.scrollTop + list.clientHeight < list.scrollHeight - 24;
  }, true);

  LAB.replay = { panelHtml, paint, FLOWS };
})();
