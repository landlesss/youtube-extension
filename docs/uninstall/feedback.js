(() => {
  const params = new URLSearchParams(location.search);
  const lang = (params.get('lang') || navigator.language).toLowerCase();
  const russian = lang.startsWith('ru');
  const translations = {
    privacy: 'Конфиденциальность', eyebrow: 'СПАСИБО, ЧТО ПОПРОБОВАЛИ',
    title: 'Прежде чем уйти,<br><em>что можно улучшить?</em>',
    intro: 'Ваш отзыв поможет сделать расширение удобнее. Достаточно одного короткого ответа.',
    reasonLabel: 'Почему вы удалили расширение?',
    not_working: 'Что-то не работает', translation: 'Не устраивает перевод', confusing: 'Неудобно пользоваться',
    limits: 'Не подходят лимиты', missing: 'Не хватает нужной функции', not_needed: 'Пока не нужно', other: 'Другая причина',
    commentLabel: 'Хотите что-то добавить? <small>Необязательно</small>',
    emailLabel: 'Email <small>Необязательно — если хотите получить ответ</small>',
    submit: 'Отправить отзыв', note: 'Ответ отправляется через Google Forms. Не указывайте пароли и другую конфиденциальную информацию.',
    skip: 'Пропустить и перейти на сайт', thanks: 'Спасибо, что помогаете нам стать лучше.', footer: 'Честная обратная связь. Больше пользы.',
  };
  if (russian) {
    document.documentElement.lang = 'ru';
    document.title = 'Обратная связь — Subtitles for YouTube';
    document.querySelectorAll('[data-copy]').forEach(element => {
      const value = translations[element.dataset.copy];
      if (value) element.innerHTML = value;
    });
    document.getElementById('comment').placeholder = 'Что произошло или что хотелось бы изменить?';
  }
  const form = document.getElementById('feedback-form');
  const comment = document.getElementById('comment');
  let generated = null;
  form.addEventListener('submit', event => {
    const selected = form.querySelector('input[name="reason"]:checked');
    if (!selected) { event.preventDefault(); return; }
    // Submit through normal browser navigation. Google shows the actual result;
    // never claim success based on an unreadable cross-origin fetch response.
    generated?.remove();
    generated = document.createElement('input');
    generated.type = 'hidden';
    generated.name = 'entry.440991757';
    const labels = { not_working: 'Something did not work', translation: 'Translation quality', confusing: 'Hard to use', limits: 'Usage limits', missing: 'Missing feature', not_needed: 'Not needed right now', other: 'Other' };
    const version = params.get('version');
    generated.value = `Uninstall feedback\nReason: ${labels[selected.value]}\n` +
      (comment.value.trim() ? `Comment: ${comment.value.trim()}\n` : '') +
      (version && /^[\d.]{1,32}$/.test(version) ? `Extension version: ${version}` : '');
    form.appendChild(generated);
    comment.removeAttribute('name');
  });
  window.addEventListener('pageshow', () => {
    generated?.remove(); generated = null;
    comment.name = 'entry.440991757';
  });
})();
