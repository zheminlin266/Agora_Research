"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import siteLogo from "@/assets/cat-logo.png";
import { useSitePreferences } from "@/components/site-preferences";
import { SiteSearch } from "@/components/site-search";
import {
  getNavigationMenu,
  navigationLabels,
  navigationSections,
  type NavigationSection,
} from "@/lib/content-manifest";

type MenuKey = "home" | NavigationSection;
type MenuItem = { title: string; href: string };
type MenuItems = Record<MenuKey, MenuItem[]>;

const navigation: Array<{ key: MenuKey; zh: string; en: string }> = [
  { key: "home", ...navigationLabels.home },
  ...navigationSections.map((key) => ({ key, ...navigationLabels[key] })),
];

const menuItems: Record<"zh" | "en", MenuItems> = {
  zh: { home: [], ...getNavigationMenu("zh") },
  en: { home: [], ...getNavigationMenu("en") },
};

const labels = {
  zh: {
    brand: "Agora Equity Research 首页",
    navigation: "主导航",
    settings: "页面设置",
    switchLanguage: "切换为英文",
    switchToLight: "切换为浅色模式",
    switchToDark: "切换为深色模式",
  },
  en: {
    brand: "Agora Equity Research home",
    navigation: "Primary navigation",
    settings: "Page settings",
    switchLanguage: "Switch to Chinese",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
  },
} as const;

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  );
}

export function SiteHeader() {
  const { language, theme, toggleLanguage, toggleTheme } = useSitePreferences();
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOpenedMenu = useRef<MenuKey | null>(null);
  const lastScrollY = useRef(0);
  const text = labels[language];

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function closeMenu() {
    cancelClose();
    hoverOpenedMenu.current = null;
    setOpenMenu(null);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      hoverOpenedMenu.current = null;
      setOpenMenu(null);
      closeTimer.current = null;
    }, 280);
  }

  useEffect(() => {
    let animationFrame = 0;
    lastScrollY.current = window.scrollY;

    function handleScroll() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        const current = window.scrollY;
        const delta = current - lastScrollY.current;

        if (current <= 16) setHeaderHidden(false);
        else if (Math.abs(delta) >= 8) setHeaderHidden(delta > 0 && openMenu === null);

        lastScrollY.current = current;
        animationFrame = 0;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;

    function handlePointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  useEffect(() => () => cancelClose(), []);

  return (
    <header
      className={`site-header${headerHidden ? " site-header--hidden" : ""}`}
      onFocus={() => setHeaderHidden(false)}
    >
      <div className="site-header__inner">
        <a className="site-brand" href="/" aria-label={text.brand}>
          <span className="site-brand__mark">
            <Image alt="" aria-hidden="true" height={38} priority sizes="38px" src={siteLogo} width={38} />
          </span>
          <span>Agora Equity Research</span>
        </a>

        <nav aria-label={text.navigation} className="site-nav" ref={navRef}>
          {navigation.map((item) => {
            const isOpen = openMenu === item.key;
            const panelId = `${item.key}-menu-panel`;
            const items = menuItems[language][item.key];
            const hasPanel = items.length > 0;

            return (
              <div
                className={`nav-menu${isOpen ? " nav-menu--open" : ""}`}
                key={item.key}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
                }}
                onFocus={() => {
                  cancelClose();
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") {
                    cancelClose();
                    hoverOpenedMenu.current = item.key;
                    setOpenMenu(item.key);
                  }
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") scheduleClose();
                }}
              >
                {item.key === "home" ? (
                  <a
                    className="nav-menu__trigger"
                    href="/"
                    onClick={closeMenu}
                  >
                    {item[language]}
                  </a>
                ) : (
                  <button
                    aria-controls={hasPanel ? panelId : undefined}
                    aria-expanded={hasPanel ? isOpen : undefined}
                    className="nav-menu__trigger"
                    onClick={() => {
                      cancelClose();
                      if (hoverOpenedMenu.current === item.key) {
                        hoverOpenedMenu.current = null;
                        setOpenMenu(item.key);
                        return;
                      }
                      setOpenMenu((current) => current === item.key ? null : item.key);
                    }}
                    type="button"
                  >
                    {item[language]}
                  </button>
                )}
                {hasPanel && <div className="nav-menu__panel" id={panelId}>
                  {items.map((menuItem) => (
                    <a
                      className="nav-menu__item"
                      href={menuItem.href}
                      key={menuItem.title}
                      rel={menuItem.href.startsWith("http") ? "noreferrer" : undefined}
                      target={menuItem.href.startsWith("http") ? "_blank" : undefined}
                    >
                      <span>{menuItem.title}</span>
                    </a>
                  ))}
                </div>}
              </div>
            );
          })}
        </nav>

        <div className="site-controls" aria-label={text.settings}>
          <SiteSearch />
          <button
            aria-label={text.switchLanguage}
            className="control-button language-button"
            onClick={() => {
              closeMenu();
              toggleLanguage();
            }}
            type="button"
          >
            <span className="control-swap" key={language}>{language === "zh" ? "En" : "文"}</span>
          </button>
          <button
            aria-label={theme === "light" ? text.switchToDark : text.switchToLight}
            className="control-button icon-button"
            onClick={toggleTheme}
            type="button"
          >
            <span className="control-icon" key={theme}>
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
