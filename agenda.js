// This public app contains no management credential. A private link is stored only
// on the user's tablet, separately from exported repertoire data.
(() => {
  const key = 'band-repertoire-agenda-link-v1';
  const endpoint = 'https://script.google.com/macros/s/AKfycbzkl_0Uo98Rps2F99XSDrjzYS3ipDQF1Rfo25c2TAOArnTxIGLGOJ3yQvInU0nStmKaeg/exec';
  const input = document.getElementById('agendaLink');
  const status = document.getElementById('agendaStatus');
  function validate(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.username || url.password ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.searchParams.get('manage') !== '1' ||
        !/^[a-f0-9]{64}$/.test(new URLSearchParams(url.hash.slice(1)).get('access') || '')) {
      throw new Error('Gebruik de persoonlijke beheerlink uit Agenda → Tablet beheren in de Windows-app.');
    }
    return url.href;
  }
  function update() {
    let saved = '';
    try { const value = localStorage.getItem(key); if (value) saved = validate(value); } catch { /* Request a fresh link. */ }
    input.value = saved;
    document.getElementById('agendaManage').href = saved || endpoint + '?manage=1';
    document.getElementById('agendaSheet').href = 'https://docs.google.com/spreadsheets/d/1JpnjU-rErzHvxW5G4LTZUsw8DjcP9IGhQAw-JE_mOPk/edit#gid=1938613877';
    status.textContent = saved ? 'Verbonden. Open Agenda beheren om afspraken bij te werken.' : 'Bewaar je beheerlink, of open Agenda beheren en vul daar je tabletcode in.';
  }
  document.getElementById('agendaConnection').onsubmit = event => {
    event.preventDefault();
    try { localStorage.setItem(key, validate(input.value.trim())); update(); }
    catch (error) { status.textContent = error.message || 'De link kon niet worden bewaard.'; }
  };
  document.getElementById('agendaForget').onclick = () => {
    localStorage.removeItem(key); update(); status.textContent = 'De link is van deze tablet verwijderd. Andere apparaten blijven verbonden.';
  };
  update();
})();
