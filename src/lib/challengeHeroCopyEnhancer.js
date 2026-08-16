function updateChallengeHeroCopy() {
  const heading = document.querySelector('.challengeSelectHero h2');
  if (!heading) return;
  const text = heading.textContent?.replace(/\s+/g, ' ').trim().toUpperCase();
  if (text !== 'ESCOLHE O DESAFIO.') return;
  heading.innerHTML = 'ACEITA O <span>DESAFIO.</span>';
}

export function startChallengeHeroCopyEnhancer() {
  if (typeof window === 'undefined') return;

  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      updateChallengeHeroCopy();
    });
  };

  run();
  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
