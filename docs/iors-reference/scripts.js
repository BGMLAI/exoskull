/**
 * IORS Landing Page - Interactive Features
 *
 * Features:
 * - Intersection Observer for scroll-triggered animations
 * - Sticky header on scroll
 * - Exit-intent popup detection
 * - Countdown timer for limited offers
 * - Smooth scrolling
 * - Back to top button
 * - CTA click tracking
 * - Loading state management
 * - Success notifications
 *
 * Performance: Optimized for < 2s load time, mobile-first
 */

(function() {
    'use strict';

    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================

    const config = {
        stickyHeaderOffset: 100,
        exitIntentSensitivity: 10,
        exitIntentDelay: 3000,
        countdownHours: 24,
        backToTopThreshold: 300,
        successNotificationDuration: 5000,
    };

    // ==========================================================================
    // LOADING STATE
    // ==========================================================================

    window.addEventListener('load', function() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
                // Remove from DOM after transition
                setTimeout(() => loadingOverlay.remove(), 400);
            }, 500);
        }
    });

    // ==========================================================================
    // STICKY HEADER
    // ==========================================================================

    const stickyHeader = document.getElementById('stickyHeader');
    let lastScrollTop = 0;

    function handleStickyHeader() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > config.stickyHeaderOffset) {
            stickyHeader.classList.add('visible');
        } else {
            stickyHeader.classList.remove('visible');
        }

        lastScrollTop = scrollTop;
    }

    // Throttle scroll events for performance
    let ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                handleStickyHeader();
                handleBackToTop();
                ticking = false;
            });
            ticking = true;
        }
    });

    // ==========================================================================
    // SCROLL-TRIGGERED ANIMATIONS (Intersection Observer)
    // ==========================================================================

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optionally unobserve after animation (performance optimization)
                // observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all elements with scroll-fade class
    document.addEventListener('DOMContentLoaded', function() {
        const fadeElements = document.querySelectorAll('.scroll-fade');
        fadeElements.forEach(el => observer.observe(el));
    });

    // ==========================================================================
    // SMOOTH SCROLLING
    // ==========================================================================

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');

            // Skip if href is just "#" or empty
            if (href === '#' || href === '') return;

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                // Track navigation
                if (window.trackEvent) {
                    window.trackEvent('navigation_click', {
                        destination: href
                    });
                }
            }
        });
    });

    // ==========================================================================
    // EXIT INTENT POPUP
    // ==========================================================================

    const exitPopup = document.getElementById('exitPopup');
    const exitPopupClose = document.getElementById('exitPopupClose');
    let exitIntentShown = false;
    let exitIntentTimeout;

    function showExitIntent() {
        if (!exitIntentShown) {
            exitPopup.classList.add('active');
            exitIntentShown = true;

            // Track exit intent
            if (window.trackEvent) {
                window.trackEvent('exit_intent_shown', {});
            }
        }
    }

    // Detect mouse leaving viewport
    document.addEventListener('mouseleave', function(e) {
        if (e.clientY < config.exitIntentSensitivity) {
            // Delay to prevent accidental triggers
            clearTimeout(exitIntentTimeout);
            exitIntentTimeout = setTimeout(showExitIntent, config.exitIntentDelay);
        }
    });

    // Close exit popup
    if (exitPopupClose) {
        exitPopupClose.addEventListener('click', function() {
            exitPopup.classList.remove('active');
        });
    }

    // Close on background click
    if (exitPopup) {
        exitPopup.addEventListener('click', function(e) {
            if (e.target === exitPopup) {
                exitPopup.classList.remove('active');
            }
        });
    }

    // Prevent showing exit intent multiple times
    const exitPopupCTAs = exitPopup.querySelectorAll('.cta-button');
    exitPopupCTAs.forEach(cta => {
        cta.addEventListener('click', function() {
            exitPopup.classList.remove('active');
        });
    });

    // ==========================================================================
    // COUNTDOWN TIMER
    // ==========================================================================

    function initCountdown() {
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');

        if (!hoursEl || !minutesEl || !secondsEl) return;

        // Set end time (24 hours from now, or use localStorage for persistence)
        let endTime = localStorage.getItem('countdownEndTime');

        if (!endTime) {
            endTime = new Date().getTime() + (config.countdownHours * 60 * 60 * 1000);
            localStorage.setItem('countdownEndTime', endTime);
        } else {
            endTime = parseInt(endTime);
        }

        function updateCountdown() {
            const now = new Date().getTime();
            const distance = endTime - now;

            if (distance < 0) {
                // Reset countdown
                endTime = new Date().getTime() + (config.countdownHours * 60 * 60 * 1000);
                localStorage.setItem('countdownEndTime', endTime);
                return;
            }

            const hours = Math.floor(distance / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            hoursEl.textContent = String(hours).padStart(2, '0');
            minutesEl.textContent = String(minutes).padStart(2, '0');
            secondsEl.textContent = String(seconds).padStart(2, '0');
        }

        // Update immediately and then every second
        updateCountdown();
        setInterval(updateCountdown, 1000);
    }

    document.addEventListener('DOMContentLoaded', initCountdown);

    // ==========================================================================
    // BACK TO TOP BUTTON
    // ==========================================================================

    const backToTopButton = document.getElementById('backToTop');

    function handleBackToTop() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > config.backToTopThreshold) {
            backToTopButton.classList.add('visible');
        } else {
            backToTopButton.classList.remove('visible');
        }
    }

    if (backToTopButton) {
        backToTopButton.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            // Track back to top
            if (window.trackEvent) {
                window.trackEvent('back_to_top_click', {});
            }
        });
    }

    // ==========================================================================
    // CTA CLICK TRACKING
    // ==========================================================================

    document.addEventListener('DOMContentLoaded', function() {
        const ctaButtons = document.querySelectorAll('[data-event]');

        ctaButtons.forEach(button => {
            button.addEventListener('click', function() {
                const eventName = this.getAttribute('data-event');

                if (window.trackEvent && eventName) {
                    window.trackEvent(eventName, {
                        button_text: this.textContent.trim(),
                        button_location: this.closest('section')?.id || 'unknown'
                    });
                }

                // Show success notification after click
                showSuccessNotification();
            });
        });
    });

    // ==========================================================================
    // SUCCESS NOTIFICATION
    // ==========================================================================

    function showSuccessNotification() {
        const notification = document.getElementById('successNotification');
        if (!notification) return;

        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, config.successNotificationDuration);
    }

    // ==========================================================================
    // PERFORMANCE MONITORING
    // ==========================================================================

    window.addEventListener('load', function() {
        // Log performance metrics
        if (window.performance && window.performance.timing) {
            const perfData = window.performance.timing;
            const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
            const connectTime = perfData.responseEnd - perfData.requestStart;
            const renderTime = perfData.domComplete - perfData.domLoading;

            console.log('Performance Metrics:');
            console.log('Page Load Time: ' + (pageLoadTime / 1000) + 's');
            console.log('Connect Time: ' + (connectTime / 1000) + 's');
            console.log('Render Time: ' + (renderTime / 1000) + 's');

            // Track performance if under threshold
            if (window.trackEvent) {
                window.trackEvent('page_performance', {
                    load_time: pageLoadTime,
                    under_2s: pageLoadTime < 2000
                });
            }

            // Warn if load time exceeds 2 seconds
            if (pageLoadTime > 2000) {
                console.warn('Page load time exceeds 2s target: ' + (pageLoadTime / 1000) + 's');
            }
        }
    });

    // ==========================================================================
    // ACCESSIBILITY ENHANCEMENTS
    // ==========================================================================

    // Skip to main content (for keyboard navigation)
    document.addEventListener('DOMContentLoaded', function() {
        const skipLink = document.createElement('a');
        skipLink.href = '#hero';
        skipLink.textContent = 'Skip to main content';
        skipLink.className = 'skip-link';
        skipLink.style.cssText = `
            position: absolute;
            top: -40px;
            left: 0;
            background: var(--red);
            color: white;
            padding: 8px;
            z-index: 100;
            text-decoration: none;
        `;
        skipLink.addEventListener('focus', function() {
            this.style.top = '0';
        });
        skipLink.addEventListener('blur', function() {
            this.style.top = '-40px';
        });
        document.body.insertBefore(skipLink, document.body.firstChild);
    });

    // Trap focus in exit popup when open
    if (exitPopup) {
        const focusableElements = exitPopup.querySelectorAll(
            'a[href], button:not([disabled]), textarea, input, select'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        exitPopup.addEventListener('keydown', function(e) {
            if (!exitPopup.classList.contains('active')) return;

            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            }

            if (e.key === 'Escape') {
                exitPopup.classList.remove('active');
            }
        });
    }

    // ==========================================================================
    // FORM HANDLING (if forms are added later)
    // ==========================================================================

    function handleFormSubmit(form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            // Add loading state
            const submitButton = form.querySelector('[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Wysyłanie...';
            }

            // Simulate form submission (replace with actual AJAX call)
            setTimeout(() => {
                showSuccessNotification();
                form.reset();

                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Wyślij';
                }

                // Track form submission
                if (window.trackEvent) {
                    window.trackEvent('form_submitted', {
                        form_id: form.id || 'unknown'
                    });
                }
            }, 1500);
        });
    }

    // Auto-detect and enhance forms
    document.addEventListener('DOMContentLoaded', function() {
        const forms = document.querySelectorAll('form');
        forms.forEach(handleFormSubmit);
    });

    // ==========================================================================
    // PWA SERVICE WORKER REGISTRATION (Optional)
    // ==========================================================================

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            // Uncomment when service-worker.js is ready
            /*
            navigator.serviceWorker.register('/service-worker.js')
                .then(function(registration) {
                    console.log('ServiceWorker registered:', registration);
                })
                .catch(function(err) {
                    console.log('ServiceWorker registration failed:', err);
                });
            */
        });
    }

    // ==========================================================================
    // CONSOLE WELCOME MESSAGE
    // ==========================================================================

    console.log('%c IORS Landing Page ', 'background: #E31E24; color: white; font-size: 20px; padding: 10px;');
    console.log('%c Enhanced with professional animations and interactions ', 'font-size: 12px; color: #666;');
    console.log('%c Performance optimized for < 2s load time ', 'font-size: 12px; color: #666;');

})();
