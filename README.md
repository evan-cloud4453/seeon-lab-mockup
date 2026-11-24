# SEEON Lab 목업

SEEON 시연 · 실험 웹페이지(SEEON Lab, 가칭)의 화면 목업이다. 서버 없이 도는 정적 HTML이고, 버튼을 누르면 가짜 자료로 흐름만 보여 준다.

- 사이트: https://evan-cloud4453.github.io/seeon-lab-mockup/
- 화면의 숫자는 모두 가짜 값이다(11.1, 22.2처럼 같은 숫자를 되풀이한 꼴).
- 재생 화면의 해설 문장과 해설이 들어간 자리만 실제 결과다. 2026년 10월에 영상 처리 도구로 아래 클립을 처리한 결과를 그대로 썼다.
- 재생 화면 영상: 기상청 정례 예보 브리핑(2026-06-18) 가운데 2분 59초 구간

## 주소 예

| 화면 | 주소 |
| --- | --- |
| 시연 목록 | `#/demo` |
| 재생 | `#/demo/play?t=62&cond=S&tab=process` |
| 실시간 재현 | `#/demo/play?view=replay&t=62.45` |
| 실험 실행(실험 상태) | `#/run?mode=exp&freeze=1` |
| 결과 비교 | `#/compare?ctab=E6` |
| 모델 · 서버 상태 | `#/status?mode=exp` |

## 구성

- `index.html`, `css/lab.css`, `js/`(app · views · replay · data)
- `media/`: 재생 화면의 영상과 해설이 들어간 음성
- `img/`: 클립 썸네일, 로고
- `fonts/`: Pretendard(SIL Open Font License 1.1, `fonts/Pretendard-LICENSE.txt`)
