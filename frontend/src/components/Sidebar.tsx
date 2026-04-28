import { Fragment, type CSSProperties, type KeyboardEvent } from "react";
import type { SidebarSection } from "../types/sidebar";
import { ChevronDown, ChevronUp } from "lucide-react";

const DEFAULT_ICON_STYLES = [
  { color: "#2563eb", background: "rgba(37, 99, 235, 0.14)" },
  { color: "#0f766e", background: "rgba(15, 118, 110, 0.15)" },
  { color: "#b45309", background: "rgba(180, 83, 9, 0.15)" },
  { color: "#7c3aed", background: "rgba(124, 58, 237, 0.14)" },
  { color: "#be123c", background: "rgba(190, 18, 60, 0.14)" },
  { color: "#0f766e", background: "rgba(20, 184, 166, 0.14)" },
  { color: "#0369a1", background: "rgba(3, 105, 161, 0.14)" },
  { color: "#15803d", background: "rgba(21, 128, 61, 0.14)" },
];

const isActivationKey = (key: string) => key === "Enter" || key === " ";

const handleActivationKey = (
  event: KeyboardEvent<HTMLDivElement>,
  callback: () => void,
) => {
  if (!isActivationKey(event.key)) return;
  event.preventDefault();
  callback();
};

type SidebarProps = {
  sections: SidebarSection[];
  className?: string;
};

export function Sidebar({ sections, className }: SidebarProps) {
  const wrapperClass = ["o-sidebar", className].filter(Boolean).join(" ");
  const buildIconStyle = (
    color?: string,
    background?: string,
    fallbackIndex = 0,
  ): CSSProperties => {
    const fallback =
      DEFAULT_ICON_STYLES[fallbackIndex % DEFAULT_ICON_STYLES.length];
    const resolvedColor = color || fallback.color;
    const resolvedBackground = background || fallback.background;

    return {
      "--sidebar-icon-color": resolvedColor,
      "--sidebar-icon-color-active": resolvedColor,
      "--sidebar-icon-bg": resolvedBackground,
      "--sidebar-icon-bg-active": resolvedBackground,
    } as CSSProperties;
  };

  return (
    <div className={wrapperClass}>
      {sections.map((section, sectionIndex) => (
        <div className="o-sidebar-section" key={section.id}>
          <div className="o-sidebar-title">{section.title}</div>
          {section.items.map((item, itemIndex) => {
            const hasDropdown = Boolean(item.dropdownItems?.length);
            const dropdownActive = item.dropdownItems?.some(
              (dropdownItem) => dropdownItem.isActive,
            );
            const dropdownOpen = hasDropdown && (item.isActive || dropdownActive);
            const iconStyle = buildIconStyle(
              item.iconColor,
              item.iconBackground,
              sectionIndex * 20 + itemIndex,
            );

            return (
              <Fragment key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={item.isActive ? "true" : "false"}
                  className={`o-sidebar-item ${item.isActive ? "active" : ""}`}
                  onClick={item.onClick}
                  onKeyDown={(event) => handleActivationKey(event, item.onClick)}
                >
                  <span className="o-sidebar-item-label">
                    {item.icon && (
                      <span
                        className="o-sidebar-item-icon"
                        style={iconStyle}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="o-sidebar-item-text">{item.label}</span>
                  </span>
                  {hasDropdown && (
                    <span
                      aria-hidden="true"
                      className="o-sidebar-dropdown-indicator"
                    >
                      {dropdownOpen ? <ChevronUp /> : <ChevronDown />}
                    </span>
                  )}
                  {item.badge && <span className="o-sidebar-count">{item.badge}</span>}
                </div>

                {hasDropdown && (
                  <details className="o-sidebar-dropdown" open={dropdownOpen}>
                    <summary aria-hidden tabIndex={-1} />
                    <div className="o-sidebar-dropdown-content">
                      {item.dropdownItems!.map((dropdownItem) => (
                        <div
                          key={dropdownItem.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={dropdownItem.isActive ? "true" : "false"}
                          className={`o-sidebar-item ${
                            dropdownItem.isActive ? "active" : ""
                          }`}
                          onClick={dropdownItem.onClick}
                          onKeyDown={(event) =>
                            handleActivationKey(event, dropdownItem.onClick)
                          }
                        >
                          <span
                            style={{
                              letterSpacing: "0.5px",
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            {dropdownItem.label}
                          </span>
                          {dropdownItem.badge && (
                            <span className="o-sidebar-count">{dropdownItem.badge}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default Sidebar;
