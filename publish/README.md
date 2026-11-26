# Публикация игры

## Что уже готово

- `grimhollow-html5.zip` — универсальный HTML5-билд; `index.html` в корне архива, все пути относительные. Собран из `dist/` командой `npm.cmd run build`.
- `LISTING.md` — название, краткое и полное описание на RU/EN, теги, управление и примечания для площадок.
- `game-icon.png` (480×270) и `game-icon-large.png` (960×540) — процедурные иконки (генератор `make-icon.ps1`), не AI-generated.

## Опубликовано

- **Game Jolt:** <https://gamejolt.com/games/necropolis-last-light/1122774> — релиз 0.1.0 Published, 1 browser build, 960×540, HTTPS Yes, maturity Teen. Игра запускается без ошибок и 404.
- **Newgrounds:** <https://www.newgrounds.com/portal/view/1064503> — новая заявка (проект 8314141), т.к. прежняя 8314094 была снята модератором и не восстанавливается. В author commentary раскрыто использование AI как coding assistant; игра загружается и работает. Статус: **Under Judgment** (очередь модерации).

## Куда загружать один и тот же ZIP

### itch.io

1. <https://itch.io/register> (в браузере приложения этот сайт отдаёт 502 — открой в своём браузере).
2. Dashboard → **Create a new project** → Category: **Games** → Name: `NECROPOLIS: Last Light`.
3. Uploads → загрузить `grimhollow-html5.zip`, поставить галочку **This file will be played in the browser**.
4. В настройках встраивания указать размер 960×540 (или «Automatic»).
5. Вставить описание и теги из `LISTING.md`, добавить скриншоты, выбрать free, поставить **Public** и опубликовать.

### Game Jolt

1. <https://gamejolt.com/join> — вкладка уже открыта в приложении.
2. После входа: **Add game** → Type: **HTML game** → загрузить `grimhollow-html5.zip`.
3. Заполнить описание, теги, обложку (рекомендуется 640×360 или 1280×720), указать управление.
4. Опубликовать/отправить на проверку.

### Newgrounds

1. <https://newgrounds.com/join> — вкладка уже открыта в приложении (требуется дата рождения).
2. После входа: Games → **Submit something** → загрузить `grimhollow-html5.zip`.
3. Заполнить название, описание, теги, загрузить иконку/скриншоты.
4. Отправить на модерацию.

### Яндекс Игры

Вкладка консоли уже открыта: <https://games.yandex.ru/console/developer/signup>. После создания аккаунта разработчика — **Добавить игру** → загрузить тот же ZIP как HTML5-билд.

## Важно

- Не загружай `landing.html` как игру — это витрина, она лежит в архиве просто потому, что собирается вместе с проектом.
- Платежи и отправка email не реализованы — не обещай их в описаниях.
- Шрифты SIL OFL и тайлы CC0, файлы лицензий лежат внутри архива.
- Владелец проекта: lappyforkyzz@mail.ru
