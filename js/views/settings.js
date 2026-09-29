import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.mjs';
import { exportData, importData, listCards } from '../db.js';
import { addStarterDeck } from '../starter.js';
import { canSpeak, japaneseVoice, speak } from '../speech.js';
import { setPrefs } from '../prefs.js';
import { TopBar, Icon, usePrefs, useLive, toast, cardsWord, navigate } from '../ui.js';

const today = () => new Date().toISOString().slice(0, 10);

// На телефоне — системное «Поделиться» (Telegram, почта…), на компьютере — обычное скачивание.
export async function saveFile(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export async function persistStorage() {
  try {
    return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}

function formatSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function Settings() {
  const prefs = usePrefs();
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState(null);
  const [, forceVoice] = useState(0);
  const stats = useLive(async () => {
    const cards = await listCards('all');
    return { count: cards.length, size: cards.reduce((s, c) => s + (c.image?.size || 0), 0) };
  });

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(false));
    const t = setTimeout(() => forceVoice((x) => x + 1), 600); // голоса подгружаются не сразу
    return () => clearTimeout(t);
  }, []);

  const doExport = async () => {
    setBusy(true);
    try {
      await saveFile(await exportData(), `kotoba-backup-${today()}.json`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      const n = data.cards?.length ?? 0;
      if (!confirm(`Импортировать ${cardsWord(n)}? Карточки с таким же id будут обновлены, остальные останутся.`)) return;
      const res = await importData(data);
      toast(`Готово: ${cardsWord(res.cards)}`);
    } catch (err) {
      toast('Не удалось прочитать файл: ' + err.message, 'long');
    } finally {
      setBusy(false);
    }
  };

  const voice = canSpeak() ? japaneseVoice() : null;

  return html`
    <${TopBar} title="Настройки" />
    <main class="page settings">
      <section class="panel">
        <h2>Резервная копия</h2>
        <p class="muted">
          Все карточки хранятся только на этом устройстве. Сохраняйте копию время от времени. Этим же файлом
          можно перенести карточки на другой телефон или компьютер.
        </p>
        <div class="row-actions">
          <button class="btn primary" disabled=${busy} onClick=${doExport}><${Icon} name="upload" />Сохранить копию</button>
          <button class="btn" disabled=${busy} onClick=${() => fileRef.current.click()}><${Icon} name="download" />Загрузить из файла</button>
          <input type="file" accept=".json,application/json" hidden ref=${fileRef} onChange=${doImport} />
        </div>
      </section>

      <section class="panel">
        <h2>Повторение</h2>
        <label class="field inline">
          <span>Новых карточек в день</span>
          <input class="input narrow" type="number" min="1" max="200" inputmode="numeric" value=${prefs.newPerDay}
            onChange=${(e) => setPrefs({ newPerDay: Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 10)) })} />
        </label>
      </section>

      <section class="panel">
        <h2>Озвучка</h2>
        ${!canSpeak()
          ? html`<p class="muted">Этот браузер не умеет озвучивать текст.</p>`
          : html`<p class="muted">
                ${voice
                  ? `Японский голос: ${voice.name}`
                  : 'Японский голос не найден. На телефоне его можно добавить в настройках: «Синтез речи» или «Устный контент» → японский.'}
              </p>
              <button class="btn" onClick=${() => speak('こんにちは。おおかみ、ひつじ。')}><${Icon} name="sound" />Проверить</button>`}
      </section>

      <section class="panel">
        <h2>Хранилище</h2>
        <p class="muted">
          ${stats ? `${cardsWord(stats.count)}, картинки занимают ${formatSize(stats.size)}.` : '…'}
          ${persisted === true && ' Браузер не будет удалять данные.'}
        </p>
        ${persisted === false &&
        html`<button class="btn" onClick=${async () => {
          const ok = await persistStorage();
          setPersisted(ok);
          toast(ok ? 'Данные защищены от автоочистки' : 'Браузер не разрешил. Установите приложение на главный экран.', ok ? '' : 'long');
        }}>Защитить от автоочистки</button>`}
      </section>

      <section class="panel">
        <h2>Стартовая колода</h2>
        <p class="muted">17 первых слов с картинками: животные, цвета, «большой», «маленький»…</p>
        <button class="btn" disabled=${busy} onClick=${async () => {
          setBusy(true);
          const deck = await addStarterDeck();
          setBusy(false);
          navigate('/deck/' + deck.id);
        }}><${Icon} name="plus" />Добавить ещё раз</button>
      </section>

      <section class="panel about">
        <h2><span class="jp">言葉</span> Kotoba</h2>
        <p class="muted">
          Чтобы пользоваться как приложением, добавьте сайт на главный экран: в Safari «Поделиться» →
          «На экран Домой», в Chrome меню ⋮ → «Добавить на главный экран».
        </p>
        <p class="muted small">
          Словарь: <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" target="_blank" rel="noopener">JMdict</a>
          © EDRDG, лицензия <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.
        </p>
      </section>
    </main>
  `;
}
