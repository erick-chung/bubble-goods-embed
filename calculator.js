/* pricing calc for the zendesk help center - single file on purpose,
   loaded via iframe from github pages. splitting = cache-bust headache
   across multiple urls, not worth it at this size.

   gotcha: HIGH_BUNDLE_WARNING has to stay in onBundleInput. onBundleBlur
   ends with a call to onBundleInput which clears warnings, so anything
   set in Blur gets wiped immediately. */

'use strict';

(function () {

  const MIN_TAKEHOME = 1;
  const MAX_TAKEHOME = 99;
  const MIN_BUNDLE = 1;
  const MAX_BUNDLE = 50;
  const HIGH_BUNDLE_WARNING = 12;
  const MIN_SAFE_MARGIN = 10;
  const MAX_SAFE_MARGIN = 45;
  const HIGH_DISCOUNT_WARNING = 50;
  const HIGH_INPUT_WARNING = 1000;
  const MAX_REASONABLE_MSRP = 10000;
  const EXTREME_DENOMINATOR = 0.05;
  const FREE_SHIPPING_THRESHOLD = 80;
  const TYPICAL_SHIPPING_COST = 10.50;

  let takehome = null;
  const dom = {};


  function sanitizeMoney(raw) {
    if (raw === '' || raw === null || raw === undefined) return 0;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function sanitizeInt(raw, min, max) {
    if (raw === '' || raw === null || raw === undefined) return min;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function fmtMoney(n) {
    if (!Number.isFinite(n)) return '—';
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function round3(n) { return Math.round(n * 1000) / 1000; }


  function cacheElements() {
    const ids = [
      'takehome', 'takehome-err', 'takehome-warn',
      'cogs', 'cogs-err', 'cogs-warn',
      'bundle', 'bundle-minus', 'bundle-plus', 'bundle-hint', 'bundle-warn',
      'fulfillment', 'ful-err', 'ful-warn',
      'shipping', 'ship-err', 'ship-warn',
      'total-display',
      'margin', 'margin-display', 'margin-warn',
      'discount', 'discount-display', 'discount-warn',
      'alert-denom-error', 'alert-denom-small',
      'result-badges', 'msrp-output', 'msrp-hint',
      'sale-preview', 'sale-pct', 'sale-price', 'sale-revenue', 'sale-costs', 'sale-profit', 'sale-profit-row',
      'summary-box', 's-cogs', 's-bundle', 's-prod-total', 's-ful', 's-ship', 's-total',
      's-share-lbl', 's-share-val', 's-margin-lbl', 's-margin-val',
      's-discount-row', 's-discount-lbl', 's-discount-val', 's-net',
      'smart-warning', 'sw-title-text', 'sw-body', 'sw-suggest'
    ];
    ids.forEach(function (id) {
      const camel = id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      dom[camel] = document.getElementById(id);
    });
  }

  function setFieldMessage(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('visible', !!msg);
  }

  function clearFieldMessages(errEl, warnEl) {
    setFieldMessage(errEl, '');
    setFieldMessage(warnEl, '');
  }

  function showAlert(el) { if (el) el.classList.add('visible'); }
  function hideAlert(el) { if (el) el.classList.remove('visible'); }

  function buildMixedText(parts) {
    const frag = document.createDocumentFragment();
    parts.forEach(function (p) {
      if (typeof p === 'string') {
        frag.appendChild(document.createTextNode(p));
      } else if (p && p.text) {
        if (p.link) {
          const a = document.createElement('a');
          a.href = p.link;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = p.text;
          frag.appendChild(a);
        } else if (p.bold) {
          const strong = document.createElement('strong');
          strong.textContent = p.text;
          frag.appendChild(strong);
        } else {
          frag.appendChild(document.createTextNode(p.text));
        }
      }
    });
    return frag;
  }

  function replaceChildren(el, node) {
    while (el.firstChild) el.removeChild(el.firstChild);
    if (node) el.appendChild(node);
  }


  function onTakehomeInput() {
    const raw = dom.takehome.value;
    clearFieldMessages(dom.takehomeErr, dom.takehomeWarn);
    dom.takehome.classList.remove('has-error');

    if (raw === '') {
      takehome = null;
      calc();
      return;
    }

    const n = parseFloat(raw);
    if (!Number.isFinite(n)) {
      takehome = null;
      calc();
      return;
    }

    if (n < MIN_TAKEHOME || n > MAX_TAKEHOME) {
      dom.takehome.classList.add('has-error');
      setFieldMessage(dom.takehomeErr, 'Take home rate must be between ' + MIN_TAKEHOME + '% and ' + MAX_TAKEHOME + '%.');
      takehome = null;
      calc();
      return;
    }

    takehome = n;
    calc();
  }

  function onTakehomeBlur() {
    const raw = dom.takehome.value;
    dom.takehome.classList.remove('has-error');
    clearFieldMessages(dom.takehomeErr, dom.takehomeWarn);

    if (raw === '') {
      takehome = null;
      calc();
      return;
    }

    const n = parseFloat(raw);
    if (!Number.isFinite(n)) {
      dom.takehome.value = '';
      takehome = null;
      calc();
      return;
    }

    // round + clamp on blur
    let rounded = Math.round(n);
    if (rounded < MIN_TAKEHOME) rounded = MIN_TAKEHOME;
    else if (rounded > MAX_TAKEHOME) rounded = MAX_TAKEHOME;

    dom.takehome.value = String(rounded);
    takehome = rounded;
    calc();
  }


  function onMoneyInput(input, errEl, warnEl) {
    clearFieldMessages(errEl, warnEl);
    input.classList.remove('has-error');
    const raw = input.value;
    if (raw !== '' && parseFloat(raw) < 0) {
      input.classList.add('has-error');
      setFieldMessage(errEl, 'Value cannot be negative. Enter 0 or a positive amount.');
    }
    calc();
  }

  function onMoneyBlur(input, errEl, warnEl) {
    clearFieldMessages(errEl, warnEl);
    input.classList.remove('has-error');
    const raw = input.value;

    if (raw === '') {
      input.value = '';
      calc();
      return;
    }

    const n = parseFloat(raw);
    if (!Number.isFinite(n)) {
      input.value = '';
      setFieldMessage(errEl, 'Please enter a valid number.');
      input.classList.add('has-error');
      calc();
      return;
    }
    if (n < 0) {
      input.value = '0.00';
      setFieldMessage(warnEl, 'Negative values are not valid here. Reset to $0.00.');
      calc();
      return;
    }
    input.value = n.toFixed(2);
    if (n > HIGH_INPUT_WARNING) {
      setFieldMessage(warnEl, 'This is a high value, double-check it looks right.');
    }
    calc();
  }


  function adjustBundle(delta) {
    const current = sanitizeInt(dom.bundle.value, MIN_BUNDLE, MAX_BUNDLE);
    let next = current + delta;
    if (next < MIN_BUNDLE) next = MIN_BUNDLE;
    if (next > MAX_BUNDLE) next = MAX_BUNDLE;
    dom.bundle.value = next;
    onBundleInput();
  }

  function onBundleInput() {
    const raw = dom.bundle.value;
    setFieldMessage(dom.bundleWarn, '');
    dom.bundle.classList.remove('has-error');
    const parsed = parseInt(raw, 10);
    if (raw !== '' && (parsed < 1 || !Number.isFinite(parsed))) {
      dom.bundle.classList.add('has-error');
    }
    const n = sanitizeInt(raw, MIN_BUNDLE, MAX_BUNDLE);
    dom.bundleHint.textContent = n === 1 ? 'Single item' : n + '-pack bundle';
    // keep in here - onBundleBlur wipes this if set there
    if (n >= HIGH_BUNDLE_WARNING) {
      setFieldMessage(dom.bundleWarn, 'A large bundle is unusual, double-check this is intentional.');
    }
    calc();
  }

  function onBundleBlur() {
    // normalize display, onBundleInput does the rest
    const n = sanitizeInt(dom.bundle.value, MIN_BUNDLE, MAX_BUNDLE);
    dom.bundle.value = String(n);
    onBundleInput();
  }

  function onMarginInput() {
    const v = parseInt(dom.margin.value, 10);
    dom.marginDisplay.textContent = v + '%';
    dom.margin.setAttribute('aria-valuenow', String(v));
    setFieldMessage(dom.marginWarn, '');
    if (v < MIN_SAFE_MARGIN) {
      setFieldMessage(dom.marginWarn, 'A margin below 10% may not be sustainable. Consider at least 20%.');
    } else if (v > MAX_SAFE_MARGIN) {
      setFieldMessage(dom.marginWarn, 'A margin above 45% is unusually high and may make your listing price uncompetitive.');
    }
    calc();
  }

  function onDiscountInput() {
    const v = parseInt(dom.discount.value, 10);
    dom.discountDisplay.textContent = v + '%';
    dom.discount.setAttribute('aria-valuenow', String(v));
    setFieldMessage(dom.discountWarn, '');
    if (v >= HIGH_DISCOUNT_WARNING) {
      setFieldMessage(dom.discountWarn, 'Discounts of 50% or more require very high markups and may not be sustainable long term.');
    }
    calc();
  }


  function renderBadges(bundleSize, discountPct) {
    const container = dom.resultBadges;
    while (container.firstChild) container.removeChild(container.firstChild);

    const takehomeBadge = document.createElement('span');
    takehomeBadge.className = 'result-badge';
    takehomeBadge.textContent = takehome + '% take home';
    container.appendChild(takehomeBadge);

    if (bundleSize > 1) {
      const bundleBadge = document.createElement('span');
      bundleBadge.className = 'result-badge bundle';
      bundleBadge.textContent = bundleSize + '-pack';
      container.appendChild(bundleBadge);
    }
    if (discountPct > 0) {
      const saleBadge = document.createElement('span');
      saleBadge.className = 'result-badge sale';
      saleBadge.textContent = discountPct + '% sale ready';
      container.appendChild(saleBadge);
    }
  }

  // static content, build once at init
  function buildSmartWarningContent() {
    dom.swTitleText.textContent = 'Heads up, shipping label cost is $0.00';

    replaceChildren(dom.swBody, buildMixedText([
      'Some plans require you to cover the shipping label when a customer\u2019s order crosses ',
      { text: '$' + FREE_SHIPPING_THRESHOLD, bold: true },
      '. If yours does, leaving this at $0.00 means the recommended price above may not protect your margin on larger orders.'
    ]));

    replaceChildren(dom.swSuggest, buildMixedText([
      'If Bubble Goods covers shipping under your plan, you can ignore this. Otherwise, enter your typical shipping label cost (typically around ',
      { text: '$' + TYPICAL_SHIPPING_COST.toFixed(2), bold: true },
      ').'
    ]));
  }

  function renderSmartWarning(cogs, fulfillment, shipping) {
    const shouldShow = (cogs > 0 || fulfillment > 0) && shipping <= 0;
    dom.smartWarning.classList.toggle('visible', shouldShow);
  }


  function calc() {
    // nothing to do until seller enters take home
    if (takehome === null) {
      dom.msrpOutput.className = 'result-price muted';
      dom.msrpOutput.textContent = '—';
      dom.summaryBox.style.display = 'none';
      dom.totalDisplay.textContent = '$0.00';
      const container = dom.resultBadges;
      while (container.firstChild) container.removeChild(container.firstChild);
      hideAlert(dom.alertDenomError);
      hideAlert(dom.alertDenomSmall);
      dom.salePreview.classList.remove('visible');
      dom.smartWarning.classList.remove('visible');
      return;
    }

    const share = round3(takehome / 100);
    const cogs = sanitizeMoney(dom.cogs.value);
    const bundleSize = sanitizeInt(dom.bundle.value, MIN_BUNDLE, MAX_BUNDLE);
    const ful = sanitizeMoney(dom.fulfillment.value);
    const ship = sanitizeMoney(dom.shipping.value);
    const marginPct = parseInt(dom.margin.value, 10);
    const margin = marginPct / 100;
    const discountPct = parseInt(dom.discount.value, 10);
    const discount = discountPct / 100;

    const prodTotal = round2(cogs * bundleSize);
    const total = round2(prodTotal + ful + ship);
    const saleFactor = round3(1 - discount);
    const effectiveDenom = round3((share - margin) * saleFactor);

    dom.totalDisplay.textContent = fmtMoney(total);
    renderBadges(bundleSize, discountPct);

    dom.sCogs.textContent = fmtMoney(cogs);
    dom.sBundle.textContent = bundleSize === 1 ? '1 (single item)' : bundleSize + '-pack';
    dom.sProdTotal.textContent = fmtMoney(prodTotal);
    dom.sFul.textContent = fmtMoney(ful);
    dom.sShip.textContent = fmtMoney(ship);
    dom.sTotal.textContent = fmtMoney(total);
    dom.sShareLbl.textContent = 'Your take home (' + takehome + '%)';
    dom.sShareVal.textContent = share.toFixed(2);
    dom.sMarginLbl.textContent = 'Profit goal (' + marginPct + '%)';
    dom.sMarginVal.textContent = margin.toFixed(2);

    if (discountPct > 0) {
      dom.sDiscountLbl.textContent = 'Sale buffer (' + discountPct + '% off)';
      dom.sDiscountVal.textContent = '× ' + saleFactor.toFixed(2);
      dom.sDiscountRow.style.display = 'flex';
    } else {
      dom.sDiscountRow.style.display = 'none';
    }
    dom.sNet.textContent = effectiveDenom.toFixed(3);

    hideAlert(dom.alertDenomError);
    hideAlert(dom.alertDenomSmall);
    dom.salePreview.classList.remove('visible');

    // denom zero or neg = math breaks
    if ((share - margin) <= 0 || effectiveDenom <= 0) {
      dom.msrpOutput.className = 'result-price error-color';
      dom.msrpOutput.textContent = 'Cannot calculate';
      dom.msrpHint.textContent = 'Your margin or discount is too high for your take home rate.';
      dom.summaryBox.style.display = 'none';
      showAlert(dom.alertDenomError);
      dom.smartWarning.classList.remove('visible');
      return;
    }

    if (total === 0) {
      dom.msrpOutput.className = 'result-price muted';
      dom.msrpOutput.textContent = '—';
      dom.msrpHint.textContent = 'Fill in your costs above to see your recommendation';
      dom.summaryBox.style.display = 'none';
      dom.smartWarning.classList.remove('visible');
      return;
    }

    const msrp = round2(total / effectiveDenom);

    if (!Number.isFinite(msrp) || msrp > MAX_REASONABLE_MSRP) {
      dom.msrpOutput.className = 'result-price error-color';
      dom.msrpOutput.textContent = 'Check inputs';
      dom.msrpHint.textContent = 'Result is outside a reasonable range, review your values.';
      dom.summaryBox.style.display = 'none';
      dom.smartWarning.classList.remove('visible');
      return;
    }

    if (effectiveDenom < EXTREME_DENOMINATOR) showAlert(dom.alertDenomSmall);

    dom.msrpOutput.className = 'result-price';
    dom.msrpOutput.textContent = fmtMoney(msrp);

    if (discountPct > 0) {
      dom.msrpHint.textContent = 'Recommended for ' + bundleSize + '-pack' + (bundleSize === 1 ? ' (single item)' : '') + ', priced to survive a ' + discountPct + '% sale';
    } else if (bundleSize > 1) {
      dom.msrpHint.textContent = 'Recommended for ' + bundleSize + '-pack bundle';
    } else {
      dom.msrpHint.textContent = 'Recommended listing price for this product';
    }
    dom.summaryBox.style.display = 'block';

    if (discountPct > 0) {
      const salePrice = round2(msrp * saleFactor);
      const saleRevenue = round2(salePrice * share);
      const saleProfit = round2(saleRevenue - total);
      dom.salePct.textContent = discountPct + '%';
      dom.salePrice.textContent = fmtMoney(salePrice);
      dom.saleRevenue.textContent = fmtMoney(saleRevenue);
      dom.saleCosts.textContent = fmtMoney(total);
      dom.saleProfit.textContent = fmtMoney(saleProfit);
      dom.saleProfitRow.classList.remove('profit-pos', 'profit-neg');
      dom.saleProfitRow.classList.add(saleProfit >= 0 ? 'profit-pos' : 'profit-neg');
      dom.salePreview.classList.add('visible');
    }

    renderSmartWarning(cogs, ful, ship);
  }


  function wireEvents() {
    dom.takehome.addEventListener('input', onTakehomeInput);
    dom.takehome.addEventListener('blur', onTakehomeBlur);

    dom.cogs.addEventListener('input', function () { onMoneyInput(dom.cogs, dom.cogsErr, dom.cogsWarn); });
    dom.cogs.addEventListener('blur', function () { onMoneyBlur(dom.cogs, dom.cogsErr, dom.cogsWarn); });

    dom.fulfillment.addEventListener('input', function () { onMoneyInput(dom.fulfillment, dom.fulErr, dom.fulWarn); });
    dom.fulfillment.addEventListener('blur', function () { onMoneyBlur(dom.fulfillment, dom.fulErr, dom.fulWarn); });

    dom.shipping.addEventListener('input', function () { onMoneyInput(dom.shipping, dom.shipErr, dom.shipWarn); });
    dom.shipping.addEventListener('blur', function () { onMoneyBlur(dom.shipping, dom.shipErr, dom.shipWarn); });

    dom.bundle.addEventListener('input', onBundleInput);
    dom.bundle.addEventListener('blur', onBundleBlur);
    dom.bundleMinus.addEventListener('click', function () { adjustBundle(-1); });
    dom.bundlePlus.addEventListener('click', function () { adjustBundle(1); });

    dom.margin.addEventListener('input', onMarginInput);
    dom.discount.addEventListener('input', onDiscountInput);
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheElements();
    buildSmartWarningContent();
    wireEvents();
    calc();
  });

})();
