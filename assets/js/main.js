/**
 * main.js — общее поведение всех страниц сайта.
 * Подключается с атрибутом defer, поэтому DOM уже готов к моменту выполнения.
 */
'use strict';

/**
 * Открывает и закрывает мобильное меню, поддерживая состояние доступности
 * на кнопке-бургере. Вызывается из разметки по onclick.
 */
function toggleMenu() {
  const menu = document.getElementById('mobileMenu');
  const burger = document.querySelector('.burger');
  if (!menu || !burger) return;

  const isOpen = menu.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(isOpen));
  burger.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
}

/**
 * Раскрывает один вопрос FAQ, закрывая остальные.
 * @param {HTMLElement} el — кнопка вопроса, по которой кликнули.
 */
function toggleFaq(el) {
  const item = el.closest('.faq-item');
  if (!item) return;

  const willOpen = !item.classList.contains('open');

  document.querySelectorAll('.faq-item.open').forEach((openItem) => {
    openItem.classList.remove('open');
    openItem.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
  });

  if (willOpen) {
    item.classList.add('open');
    el.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Уплотняет шапку при прокрутке. Класс переключается в requestAnimationFrame,
 * чтобы не пересчитывать стили на каждое событие прокрутки.
 */
(function initStickyNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const SCROLL_THRESHOLD = 20;
  let scheduled = false;

  const apply = () => {
    nav.classList.toggle('scrolled', window.scrollY > SCROLL_THRESHOLD);
    scheduled = false;
  };

  window.addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }, { passive: true });

  apply();
})();

/**
 * Показывает элементы с классом .reveal по мере появления в зоне видимости
 * и заодно заполняет вложенные полосы-индикаторы (атрибут data-w — ширина
 * в процентах): графики на странице кейсов, шкалы навыков на странице «Обо мне».
 *
 * Если IntersectionObserver недоступен, всё содержимое показывается сразу.
 */
(function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  const fillBars = (container) => {
    container.querySelectorAll('[data-w]').forEach((bar) => {
      bar.style.width = `${bar.dataset.w}%`;
    });
  };

  const show = (el) => {
    el.classList.add('visible');
    fillBars(el);
  };

  if (!('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }

  const STAGGER_MS = 80;   // каскадная задержка внутри одной пачки элементов

  const observer = new IntersectionObserver((entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry, index) => {
        observer.unobserve(entry.target);
        setTimeout(() => show(entry.target), index * STAGGER_MS);
      });
  }, { threshold: 0.1 });

  items.forEach((el) => observer.observe(el));
})();
