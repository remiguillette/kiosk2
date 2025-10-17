<h1>Icon inventory</h1>

<p>
  This document lists each icon bundled with the kiosk along with its source file
  and the corresponding Lucide identifier used by the JavaScript helpers. Every
  entry contains an HTML link to the asset, a small preview, and the snippet used
  to inject the icon at runtime.
</p>

<p>
  Emergency SVGs (panic, fire, medical) expose their strokes via
  <code>currentColor</code> so BeaverAlarm can tint them through CSS variables and
  keep the UI consistent with the alert palette.
</p>

<h2>Menu</h2>

<h3>Phone</h3>
<p>
  <a href="./phone.svg">phone.svg</a><br />
  <img src="./phone.svg" alt="Phone icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="phone"></i>');
</code></pre>

<h3>Beavernet</h3>
<p>
  <a href="./beaver.png">beaver.png</a><br />
  <img src="./beaver.png" alt="Beavernet logo" width="48" />
</p>

<h3>Beavertask</h3>
<p>
  <a href="./check-square.svg">check-square.svg</a><br />
  <img src="./check-square.svg" alt="Task icon" width="48" height="48" />
</p>

<h2>Beaverphone</h2>

<h3>Return menu</h3>
<p>
  <a href="./house.svg">house.svg</a><br />
  <img src="./house.svg" alt="House icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="house"></i>');
</code></pre>

<h2>Dialpad</h2>

<h3>Erase</h3>
<p>
  <a href="./arrow-big-left-dash.svg">arrow-big-left-dash.svg</a><br />
  <img src="./arrow-big-left-dash.svg" alt="Backspace icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="arrow-big-left-dash"></i>');
</code></pre>

<h3>Call</h3>
<p>
  <a href="./phone.svg">phone.svg</a><br />
  <img src="./phone.svg" alt="Phone icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="phone"></i>');
</code></pre>

<h3>Speaker</h3>
<p>
  <a href="./volume-2.svg">volume-2.svg</a><br />
  <img src="./volume-2.svg" alt="Speaker icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="volume-2"></i>');
</code></pre>

<h3>Hold</h3>
<p>
  <a href="./circle-pause.svg">circle-pause.svg</a><br />
  <img src="./circle-pause.svg" alt="Circle pause icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="circle-pause"></i>');
</code></pre>

<h2>Websocket status animation</h2>

<h3>Activity indicator</h3>
<p>
  <a href="./chevrons-left-right-ellipsis.svg">chevrons-left-right-ellipsis.svg</a><br />
  <img src="./chevrons-left-right-ellipsis.svg" alt="Chevrons ellipsis icon" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="chevrons-left-right-ellipsis"></i>');
</code></pre>

<h3>file-text</h3>
<p>
  <a href="./file-text.svg">file-text.svg</a><br />
  <img src="./file-text.svg" alt="Doc" width="48" height="48" />
</p>
<pre><code>import { createIcons, icons } from 'lucide';

createIcons({ icons });

document.body.append('<i data-lucide="file-text"></i>');
</code></pre>

<h2>BeaverAlarm</h2>

<p>
  Panic, Fire (24h), and Medical (24h) shortcuts inline their Lucide icons so the
  stroke inherits the button color tokens. The capsule backgrounds and accent
  values live beside the markup in <code>page/beaveralarm.html</code>.
</p>

<p>
  Shared skeleton for each emergency action:
</p>
<pre><code>&lt;button class="action action--panic"&gt;
  &lt;span class="action-icon" aria-hidden="true"&gt;
    &lt;svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"&gt;
      &amp;hellip; icon paths &amp;hellip;
    &lt;/svg&gt;
  &lt;/span&gt;
  &lt;span class="action-label"&gt;PANIC&lt;/span&gt;
&lt;/button&gt;
</code></pre>

<h3>Panic</h3>
<p>
  <a href="./siren.svg">siren.svg</a><br />
  <img src="./siren.svg" alt="Siren icon" width="48" height="48" />
</p>
<p>
  Tinted via <code>.action--panic</code> with a red alert palette.
</p>

<h3>Fire (24h)</h3>
<p>
  <a href="./flame.svg">flame.svg</a><br />
  <img src="./flame.svg" alt="Flame icon" width="48" height="48" />
</p>
<p>
  Uses the amber variant supplied by <code>.action--fire</code>.
</p>

<h3>Medical (24h)</h3>
<p>
  <a href="./briefcase-medical.svg">briefcase-medical.svg</a><br />
  <img src="./briefcase-medical.svg" alt="Medical briefcase icon" width="48" height="48" />
</p>
<p>
  Styled with the cyan hues from <code>.action--medical</code>.
</p>

