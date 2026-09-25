/* A self-contained, silent product walkthrough. No video service or account needed. */
(() => {
  const player = document.querySelector('[data-demo-player]');
  if (!player) return;
  const frames = [
    { title: 'A new inquiry lands.', label: '01 / The first hello', caption: 'A potential client reaches out while you’re busy delivering work. Relay brings their inquiry into one place.', html: `<div class="demo-window-label"><span class="demo-letter">P</span><div><strong>Priya Shah</strong><small>Tandem Studio · New inquiry</small></div><span class="demo-tag">Inbox</span></div><h3>Can you help with our launch?</h3><div class="demo-message">Hi Alex, we need brand positioning for a Q1 launch. We have about <strong>$14,000</strong> set aside. Do you have time to talk this week?</div><div class="demo-insight"><span>✧</span><p><strong>An opportunity worth a conversation.</strong><br>Start with the client’s message, not a blank reply.</p></div>` },
    { title: 'Understand the opportunity.', label: '02 / A little context', caption: 'Relay identifies the service, budget, and timing, then compares the inquiry with your business preferences.', html: `<div class="demo-window-label"><span class="demo-letter relay-letter">r</span><div><strong>Relay’s inquiry brief</strong><small>Based on the client’s message</small></div><span class="demo-tag">Review fit</span></div><h3>The important details, at a glance.</h3><div class="demo-facts"><div><span>Looking for</span><strong>Brand positioning</strong></div><div><span>Project budget</span><strong>$14,000</strong></div><div><span>Target timing</span><strong>Q1 launch</strong></div></div><div class="demo-insight"><span>✓</span><p><strong>Above your $5,000 starting budget.</strong><br>A useful starting point for qualification, not a final decision.</p></div>` },
    { title: 'A thoughtful reply. Your approval.', label: '03 / Keep your voice', caption: 'Review a draft that uses the client’s context. Edit the wording, ask a useful question, and approve the next step.', html: `<div class="demo-window-label"><span class="demo-letter relay-letter">r</span><div><strong>Reply to Priya</strong><small>Warm and professional</small></div><span class="demo-tag">Draft</span></div><div class="demo-email"><span>Hi Priya,</span><p>Brand positioning ahead of your Q1 launch sounds like a good fit. Your budget is within our project range.</p><p>What would you most like the new positioning to change? Let’s explore it on a discovery call.</p><span>Best, Alex</span></div><div class="demo-approval"><span>Nothing moves without your review.</span><span class="demo-action-label">You approve →</span></div>` },
    { title: 'Make the next step a meeting.', label: '04 / Find a time', caption: 'Choose an available slot and confirm the meeting. The prototype checks its sample calendar for conflicts.', html: `<div class="demo-window-label"><span class="demo-letter">P</span><div><strong>Discovery call with Priya</strong><small>30 minutes · Eastern time</small></div><span class="demo-tag">Calendar</span></div><h3>A time that works.</h3><div class="demo-slots"><div><span>Tuesday</span><strong>10:00 AM</strong><small>Available</small></div><div class="chosen"><span>Wednesday</span><strong>2:00 PM</strong><small>Selected for confirmation ✓</small></div></div><div class="demo-insight"><span>↗</span><p><strong>You confirm. The calendar updates.</strong><br>Keep the conversation and next step together.</p></div>` },
    { title: 'Keep the conversation moving.', label: '05 / Follow through', caption: 'After the meeting and proposal, Relay prepares the next follow-up for review. The goal: fewer forgotten conversations and more time for client work.', html: `<div class="demo-window-label"><span class="demo-letter relay-letter">r</span><div><strong>Your next best move</strong><small>Priya · Tandem Studio</small></div><span class="demo-tag">Follow-up</span></div><div class="demo-mini-pipeline"><span>Inquiry ✓</span><i>→</i><span>Meeting ✓</span><i>→</i><span class="current">Proposal</span></div><h3>A helpful nudge, ready for review.</h3><div class="demo-message">Hi Priya, have you had a chance to review the positioning proposal? Happy to talk through the scope or next steps.</div><div class="demo-end-note">That’s Relay: the follow-through, with you in control.</div>` }
  ];
  const duration = 40, frameDuration = duration / frames.length;
  const play = player.querySelector('[data-demo-play]');
  const range = player.querySelector('[data-demo-seek]');
  const clock = player.querySelector('[data-demo-time]');
  const screen = player.querySelector('[data-demo-screen]');
  const caption = player.querySelector('[data-demo-caption]');
  const chapters = [...player.querySelectorAll('[data-demo-chapter]')];
  let elapsed = 0, running = false, lastTick = 0, raf = 0, current = -1;
  const format = value => `0:${String(Math.floor(value)).padStart(2, '0')}`;
  function render() {
    const index = Math.min(frames.length - 1, Math.floor(elapsed / frameDuration));
    if (index !== current) {
      current = index;
      const frame = frames[index];
      screen.innerHTML = `<div class="demo-scene"><div class="demo-scene-kicker">${frame.label}</div><div class="demo-product-card">${frame.html}</div></div>`;
      player.querySelector('[data-demo-title]').textContent = frame.title;
      caption.textContent = frame.caption;
      chapters.forEach((button, i) => {
        button.setAttribute('aria-pressed', String(i === index));
        button.classList.toggle('is-current', i === index);
      });
    }
    range.value = elapsed;
    range.setAttribute('aria-valuetext', `${Math.floor(elapsed)} of 40 seconds. ${frames[index].title}`);
    clock.textContent = `${format(elapsed)} / 0:40`;
    play.textContent = running ? 'Ⅱ Pause' : elapsed >= duration ? '↻ Replay' : elapsed > 0 ? '▶ Continue' : '▶ Play walkthrough';
    play.setAttribute('aria-label', running ? 'Pause walkthrough' : elapsed >= duration ? 'Replay walkthrough' : 'Play walkthrough');
    player.dataset.playing = String(running);
  }
  function pause() { running = false; cancelAnimationFrame(raf); render(); }
  function tick(now) {
    if (!running) return;
    elapsed = Math.min(duration, elapsed + (now - lastTick) / 1000);
    lastTick = now;
    if (elapsed >= duration) running = false;
    render();
    if (running) raf = requestAnimationFrame(tick);
  }
  function start() { if (elapsed >= duration) elapsed = 0; running = true; lastTick = performance.now(); render(); raf = requestAnimationFrame(tick); }
  play.addEventListener('click', () => running ? pause() : start());
  range.addEventListener('input', () => { elapsed = Number(range.value); lastTick = performance.now(); if (elapsed >= duration) running = false; render(); });
  chapters.forEach((button, index) => button.addEventListener('click', () => { pause(); elapsed = index * frameDuration; render(); }));
  player.querySelector('[data-demo-restart]').addEventListener('click', () => { pause(); elapsed = 0; render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause(); });
  player.hidden = false;
  render();
})();
