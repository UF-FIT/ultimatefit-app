function updateChallengeHeroCopy() {
  const hero = document.querySelector('.challengeSelectHero');
  if (!hero) return;

  const heading = hero.querySelector('h2');
  if (heading) {
    const text = heading.textContent?.replace(/\s+/g, ' ').trim().toUpperCase();
    if (text === 'ESCOLHE O DESAFIO.' || text === 'ACEITA O DESAFIO.') {
      heading.innerHTML = 'ACEITA O <span>DESAFIO.</span>';
    }
  }

  const description = hero.querySelector(':scope > p');
  if (description) description.remove();

  const benefits = hero.querySelector('.challengeBenefits');
  if (benefits && window.innerWidth <= 760) {
    benefits.style.setProperty('display', 'grid', 'important');
    benefits.style.setProperty('grid-template-columns', 'repeat(3, minmax(0, 1fr))', 'important');
    benefits.style.setProperty('gap', '8px', 'important');
    benefits.style.setProperty('width', '100%', 'important');
    benefits.style.setProperty('align-items', 'center', 'important');

    benefits.querySelectorAll(':scope > span').forEach(item => {
      item.style.setProperty('display', 'flex', 'important');
      item.style.setProperty('align-items', 'center', 'important');
      item.style.setProperty('justify-content', 'center', 'important');
      item.style.setProperty('gap', '6px', 'important');
      item.style.setProperty('min-width', '0', 'important');
      item.style.setProperty('white-space', 'nowrap', 'important');
      item.style.setProperty('font-size', '12px', 'important');
    });

    benefits.querySelectorAll('svg').forEach(icon => {
      icon.style.setProperty('width', '22px', 'important');
      icon.style.setProperty('height', '22px', 'important');
      icon.style.setProperty('flex', '0 0 auto', 'important');
    });
  }
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
  window.addEventListener('resize', run);
  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
