define([
    'jquery',
    'mage/translate'
], function ($) {
    'use strict';

    var LINE_COLOR = '#2a78d6',
        FILL_COLOR = 'rgba(42, 120, 214, 0.1)',
        GRID_COLOR = '#e4e3df',
        LABEL_COLOR = '#8a8a86',
        TICK_COUNT = 4;

    /**
     * Rounds a range to a "nice" step (1/2/5 x 10^n), the classic Heckbert algorithm.
     *
     * @param {Number} range
     * @param {Boolean} round
     * @returns {Number}
     */
    function niceNum(range, round) {
        var exponent = Math.floor(Math.log10(range)),
            fraction = range / Math.pow(10, exponent),
            niceFraction;

        if (round) {
            if (fraction < 1.5) {
                niceFraction = 1;
            } else if (fraction < 3) {
                niceFraction = 2;
            } else if (fraction < 7) {
                niceFraction = 5;
            } else {
                niceFraction = 10;
            }
        } else if (fraction <= 1) {
            niceFraction = 1;
        } else if (fraction <= 2) {
            niceFraction = 2;
        } else if (fraction <= 5) {
            niceFraction = 5;
        } else {
            niceFraction = 10;
        }

        return niceFraction * Math.pow(10, exponent);
    }

    /**
     * Generates a small set of clean, evenly-spaced axis ticks covering [min, max].
     *
     * @param {Number} min
     * @param {Number} max
     * @param {Number} tickCount
     * @returns {Number[]}
     */
    function niceTicks(min, max, tickCount) {
        var step, niceMin, niceMax, ticks, v;

        if (min === max) {
            return [min - 1, min, min + 1];
        }

        step = niceNum(niceNum(max - min, false) / (tickCount - 1), true);
        niceMin = Math.floor(min / step) * step;
        niceMax = Math.ceil(max / step) * step;
        ticks = [];

        for (v = niceMin; v <= niceMax + step / 2; v += step) {
            ticks.push(Math.round(v / step) * step);
        }

        return ticks;
    }

    /**
     * Picks a sane decimal precision for a given tick step (finer steps need more decimals).
     *
     * @param {Number} step
     * @returns {Number}
     */
    function decimalsForStep(step) {
        return step < 1 ? Math.min(6, Math.ceil(-Math.log10(step))) : 0;
    }

    /**
     * @param {Number} value
     * @param {Number} decimals
     * @returns {String}
     */
    function formatTick(value, decimals) {
        return value.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    /**
     * Draws a line chart of rate history onto a canvas, with no external charting library.
     * Returns the chart geometry so a hover layer can locate points, or null if there is no data.
     *
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLElement} emptyEl
     * @param {Object} history - Date (Y-m-d) => value
     * @returns {Object|null}
     */
    function drawChart(canvas, emptyEl, history) {
        var dates = Object.keys(history).sort(),
            ctx,
            width,
            height,
            paddingTop = 18,
            paddingBottom = 28,
            paddingRight = 16,
            paddingLeft,
            chartWidth,
            chartHeight,
            values,
            rawMin,
            rawMax,
            ticks,
            decimals,
            tickLabels,
            min,
            max,
            range,
            xAt,
            yAt,
            lastIndex,
            lastX,
            lastY;

        if (!dates.length) {
            canvas.hidden = true;
            emptyEl.hidden = false;

            return null;
        }

        canvas.hidden = false;
        emptyEl.hidden = true;

        width = canvas.clientWidth || canvas.width || 600;
        height = canvas.height || 280;
        canvas.width = width;

        ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.font = '11px Arial, sans-serif';

        values = dates.map(function (date) {
            return history[date];
        });
        rawMin = Math.min.apply(null, values);
        rawMax = Math.max.apply(null, values);
        ticks = niceTicks(rawMin, rawMax, TICK_COUNT);
        min = ticks[0];
        max = ticks[ticks.length - 1];
        range = max - min || 1;
        decimals = decimalsForStep(ticks.length > 1 ? ticks[1] - ticks[0] : 1);
        tickLabels = ticks.map(function (tick) {
            return formatTick(tick, decimals);
        });

        paddingLeft = Math.max.apply(null, tickLabels.map(function (label) {
            return ctx.measureText(label).width;
        })) + 16;

        chartWidth = width - paddingLeft - paddingRight;
        chartHeight = height - paddingTop - paddingBottom;

        /**
         * @param {Number} index
         * @returns {Number}
         */
        xAt = function (index) {
            return paddingLeft + index / (dates.length - 1 || 1) * chartWidth;
        };

        /**
         * @param {Number} value
         * @returns {Number}
         */
        yAt = function (value) {
            return paddingTop + chartHeight - (value - min) / range * chartHeight;
        };

        // Recessive gridlines with clean, rounded value labels on the left.
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ticks.forEach(function (tick, i) {
            var y = Math.round(yAt(tick)) + 0.5;

            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width - paddingRight, y);
            ctx.stroke();

            ctx.fillText(tickLabels[i], paddingLeft - 8, y);
        });
        ctx.textBaseline = 'alphabetic';

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        dates.forEach(function (date, index) {
            var px = xAt(index),
                py = yAt(history[date]);

            if (index === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        });
        ctx.strokeStyle = LINE_COLOR;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.lineTo(xAt(dates.length - 1), paddingTop + chartHeight);
        ctx.lineTo(xAt(0), paddingTop + chartHeight);
        ctx.closePath();
        ctx.fillStyle = FILL_COLOR;
        ctx.fill();

        // End-of-line marker for "today", with a surface ring so it reads over the line.
        lastIndex = dates.length - 1;
        lastX = xAt(lastIndex);
        lastY = yAt(history[dates[lastIndex]]);
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fillStyle = LINE_COLOR;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = 'left';
        ctx.fillText(dates[0], paddingLeft, height - paddingBottom + 18);
        ctx.textAlign = 'right';
        ctx.fillText(dates[dates.length - 1], width - paddingRight, height - paddingBottom + 18);
        ctx.textAlign = 'left';

        return {
            dates: dates,
            history: history,
            xAt: xAt,
            yAt: yAt,
            padding: {
                top: paddingTop,
                bottom: paddingBottom,
                left: paddingLeft,
                right: paddingRight
            },
            width: width,
            height: height
        };
    }

    /**
     * Finds the data point index whose x position is nearest to a given canvas-relative x coordinate.
     *
     * @param {Object} geometry
     * @param {Number} mouseX
     * @returns {Number}
     */
    function nearestIndex(geometry, mouseX) {
        var count = geometry.dates.length,
            chartWidth = geometry.width - geometry.padding.left - geometry.padding.right,
            ratio = (mouseX - geometry.padding.left) / (chartWidth || 1),
            index = Math.round(ratio * (count - 1));

        return Math.min(count - 1, Math.max(0, index));
    }

    /**
     * Draws a crosshair line and highlighted point on the (transparent) overlay canvas.
     *
     * @param {HTMLCanvasElement} overlay
     * @param {Object} geometry
     * @param {Number} index
     */
    function drawCrosshair(overlay, geometry, index) {
        var ctx = overlay.getContext('2d'),
            date = geometry.dates[index],
            px = geometry.xAt(index),
            py = geometry.yAt(geometry.history[date]);

        ctx.clearRect(0, 0, geometry.width, geometry.height);

        ctx.save();
        ctx.strokeStyle = '#b7b6b1';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(px, geometry.padding.top);
        ctx.lineTo(px, geometry.height - geometry.padding.bottom);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = LINE_COLOR;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }

    /**
     * Currency converter storefront widget: fetches the unit rate and history via AJAX,
     * then renders an amount-scaled conversion and chart, wiring up the currency selects,
     * swap control, amount input and time-period toggle.
     *
     * @param {Object} config
     * @param {HTMLElement} element
     */
    return function (config, element) {
        var $el = $(element),
            fromSelect = $el.find('#frankfurter-from')[0],
            toSelect = $el.find('#frankfurter-to')[0],
            swapButton = $el.find('#frankfurter-swap')[0],
            amountInput = $el.find('#frankfurter-amount')[0],
            amountCodeEl = $el.find('#frankfurter-amount-code')[0],
            rateEl = $el.find('#frankfurter-rate')[0],
            periodButtons = $el.find('.frankfurter-converter__period'),
            canvas = $el.find('#frankfurter-chart')[0],
            overlay = $el.find('#frankfurter-chart-overlay')[0],
            tooltip = $el.find('#frankfurter-chart-tooltip')[0],
            emptyEl = $el.find('#frankfurter-chart-empty')[0],
            errorEl = $el.find('#frankfurter-error')[0],
            requestToken = 0,
            baseRate = 0,
            baseHistory = {},
            baseDate = '',
            lastHistory = null,
            lastGeometry = null,
            lastToCode = '',
            lastFromCode = '',
            historyDays = config.historyDays,
            resizeTimer,
            amountTimer;

        if (!fromSelect || !toSelect) {
            return;
        }

        /**
         * @param {Number} clientX
         */
        function showTooltipAt(clientX) {
            var rect, index, date, rate;

            if (!lastGeometry) {
                return;
            }

            rect = overlay.getBoundingClientRect();
            index = nearestIndex(lastGeometry, clientX - rect.left);
            date = lastGeometry.dates[index];
            rate = lastGeometry.history[date];

            drawCrosshair(overlay, lastGeometry, index);

            tooltip.innerHTML = '<strong>' + formatRate(rate) + ' ' + lastToCode + '</strong><br>' + date;
            tooltip.style.left = lastGeometry.xAt(index) + 'px';
            tooltip.style.top = Math.max(0, lastGeometry.yAt(rate) - 12) + 'px';
            tooltip.hidden = false;
        }

        function hideTooltip() {
            tooltip.hidden = true;

            if (overlay.width && overlay.height) {
                overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
            }
        }

        $(overlay).on('mousemove', function (e) {
            showTooltipAt(e.clientX);
        });
        $(overlay).on('mouseleave', hideTooltip);

        $(overlay).on('touchstart touchmove', function (e) {
            var touch = e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0];

            if (touch) {
                showTooltipAt(touch.clientX);
            }
        });
        $(overlay).on('touchend', hideTooltip);

        /**
         * @param {Number} rate
         * @returns {String}
         */
        function formatRate(rate) {
            return rate.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
            });
        }

        function hideError() {
            errorEl.hidden = true;
            errorEl.textContent = '';
        }

        /**
         * @param {String} message
         */
        function showError(message) {
            errorEl.textContent = message;
            errorEl.hidden = false;
        }

        /**
         * @returns {Number}
         */
        function getAmount() {
            var value = parseFloat(amountInput.value);

            return isFinite(value) && value >= 0 ? value : 0;
        }

        /**
         * Builds the "vs start of period" change badge. Percentage change is scale-invariant,
         * so it reads the same whether history holds unit rates or amount-scaled values.
         *
         * @param {Object} history
         * @returns {String}
         */
        function buildChangeBadge(history) {
            var dates = Object.keys(history).sort(),
                first,
                last,
                delta,
                percent,
                direction,
                arrow;

            if (dates.length < 2) {
                return '';
            }

            first = history[dates[0]];
            last = history[dates[dates.length - 1]];
            delta = last - first;
            percent = first ? delta / first * 100 : 0;

            if (Math.abs(percent) < 0.005) {
                direction = 'flat';
                arrow = '';
            } else if (delta > 0) {
                direction = 'up';
                arrow = '▲ ';
            } else {
                direction = 'down';
                arrow = '▼ ';
            }

            return '<span class="frankfurter-converter__rate-change is-' + direction + '">' +
                arrow + (percent >= 0 ? '+' : '') + percent.toFixed(2) + '%</span>';
        }

        /**
         * Re-renders the rate line and chart from the currently cached unit rate/history and the
         * amount currently entered — no network request needed, so it's instant while typing.
         */
        function render() {
            var amount = getAmount(),
                amountLabel = amountInput.value.trim() || '0';

            lastHistory = {};
            Object.keys(baseHistory).forEach(function (date) {
                lastHistory[date] = baseHistory[date] * amount;
            });
            lastToCode = toSelect.value;
            lastFromCode = fromSelect.value;

            rateEl.classList.remove('is-loading');
            rateEl.innerHTML = '<span class="frankfurter-converter__rate-value">' + amountLabel + ' ' + lastFromCode +
                ' = ' + formatRate(baseRate * amount) + ' ' + lastToCode + '</span>' +
                buildChangeBadge(lastHistory) +
                '<span class="frankfurter-converter__rate-date">' + baseDate + '</span>';

            redrawChart();
        }

        /**
         * @param {String} from
         * @param {String} to
         */
        function updateRate(from, to) {
            var token = ++requestToken;

            hideError();
            rateEl.classList.add('is-loading');
            rateEl.innerHTML = '<span class="frankfurter-converter__spinner" aria-hidden="true"></span>' +
                '<span class="frankfurter-converter__rate-loading">' + $.mage.__('Loading rate...') + '</span>';

            $.ajax({
                url: config.ajaxUrl,
                data: {
                    from: from,
                    to: to,
                    days: historyDays
                },
                dataType: 'json',
                cache: false
            }).done(function (response) {
                if (token !== requestToken) {
                    return;
                }

                if (response.error) {
                    rateEl.classList.remove('is-loading');
                    rateEl.innerHTML = '';
                    showError(response.error);

                    return;
                }

                baseRate = response.rate;
                baseHistory = response.history || {};
                baseDate = response.date;
                amountCodeEl.textContent = response.from;

                render();
            }).fail(function () {
                if (token !== requestToken) {
                    return;
                }

                rateEl.classList.remove('is-loading');
                rateEl.innerHTML = '';
                showError($.mage.__('Unable to load the exchange rate. Please try again.'));
            });
        }

        function redrawChart() {
            hideTooltip();
            lastGeometry = drawChart(canvas, emptyEl, lastHistory || {});
            overlay.width = canvas.width;
            overlay.hidden = !lastGeometry;
        }

        function reloadRate() {
            updateRate(fromSelect.value, toSelect.value);
        }

        $(fromSelect).on('change', reloadRate);
        $(toSelect).on('change', reloadRate);

        $(swapButton).on('click', function () {
            var temp = fromSelect.value;

            fromSelect.value = toSelect.value;
            toSelect.value = temp;
            swapButton.classList.toggle('is-spinning');
            reloadRate();
        });

        $(amountInput).on('input', function () {
            clearTimeout(amountTimer);
            amountTimer = setTimeout(render, 150);
        });

        periodButtons.on('click', function () {
            historyDays = parseInt(this.getAttribute('data-days'), 10) || config.historyDays;
            periodButtons.removeClass('is-active');
            $(this).addClass('is-active');
            reloadRate();
        });

        $(window).on('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (lastHistory) {
                    redrawChart();
                }
            }, 150);
        });

        fromSelect.value = config.defaultFrom;
        toSelect.value = config.defaultTo;
        reloadRate();
    };
});
