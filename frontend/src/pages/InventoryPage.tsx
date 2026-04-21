import {
  Fragment,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";
import html2pdf from "html2pdf.js";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import JournalEntryPreviewDrawer from "../components/JournalEntryPreviewDrawer";
import { useMe } from "../hooks/useMe";
import { useCompanies, Company } from "../hooks/useCompanies";
import {
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  FileText,
  Package,
  PenLine,
  Plus,
  Printer,
  Trash2,
  TriangleAlert,
  Download,
  Upload,
  Warehouse as WarehouseGlyph,
  X,
  Zap,
  FunnelPlus,
  LayoutGrid,
  ArrowRightLeft,
  ShoppingBasket,
  LayoutDashboard,
  Warehouse,
  CirclePlus,
  PlusCircle,
} from "lucide-react";
import ValidationAlert from "../components/ValidationAlert";
import ValidatedField from "../components/ValidatedField";
import {
  getMissingRequiredFields,
  getRequiredFieldError,
} from "../utils/formValidation";
import { Sidebar } from "../components/Sidebar";
import type { SidebarSection } from "../types/sidebar";
import type { CurrencyItem } from "../types/currency";
import { useAlert } from "../context/AlertContext";
import type { AlertModalVariant } from "../components/AlertModal";
import "./InventoryPage.css";

// ============= TYPES =============
type Category = {
  id: number;
  company_id: number;
  name: string;
};

type CategoryListRow = {
  id: number;
  name: string;
  isDefault: boolean;
  products: ProductWithStock[];
  category: Category | null;
};

type Product = {
  id: number;
  company_id: number;
  category_id: number | null;
  name: string;
  description: string;
  image_url: string;
  sale_price: number;
  tax_rate: number;
  tax_id: number | null;
  sales_cost: number;
  purchase_cost: number;
  hs_code: string;
  reference: string;
  barcode: string;
  product_type: string;
  uom: string;
  track_inventory: boolean;
  min_stock_quantity: number;
  max_stock_quantity: number;
  reorder_point: number;
  weight: number;
  weight_uom: string;
  is_active: boolean;
  can_be_sold: boolean;
  can_be_purchased: boolean;
  show_in_pos: boolean;
};

type TaxSetting = {
  id: number;
  company_id: number;
  name: string;
  rate: number;
  zimra_tax_id: number | null;
  zimra_tax_code: string;
  is_zimra_tax: boolean;
  is_active: boolean;
};

type CompanySettings = {
  logo_data?: string;
  document_layout?: string;
  document_footer?: string;
  document_header?: string;
  document_watermark?: string;
  document_watermark_opacity?: string;
};

type ProductWithStock = Product & {
  quantity_on_hand: number;
  quantity_available: number;
  quantity_reserved: number;
  stock_value: number;
  location?: string;
};

type Warehouse = {
  id: number;
  company_id: number;
  name: string;
  code: string;
  address: string;
};

type Location = {
  id: number;
  warehouse_id: number;
  name: string;
  code: string;
  is_primary: boolean;
  is_scrap: boolean;
};

type NewStockCountLine = {
  id: string;
  product_id: number | null;
  warehouse_id: number | null;
  location_id: number | null;
  quantity: string;
};

type StockMove = {
  id: number;
  company_id: number;
  product_id: number;
  warehouse_id: number | null;
  location_id: number | null;
  reference: string;
  move_type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  source_document: string;
  state: string;
  currency?: string;
  scheduled_date: string | null;
  done_date: string | null;
  notes: string;
};

type StockQuant = {
  id: number;
  product_id: number;
  warehouse_id: number | null;
  location_id: number | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit_cost: number;
  total_value: number;
};

type StockMoveLineInput = {
  line_id: string;
  product_id: number | null;
  quantity: number;
  unit_cost: number;
};

// ============= CONSTANTS =============
const MOVE_TYPES = [
  { value: "in", label: "Receipt" },
  { value: "out", label: "Delivery" },
  { value: "internal", label: "Internal Transfer" },
  { value: "adjustment", label: "Inventory Adjustment" },
];

const normalizeCurrencyCode = (value: string | null | undefined) => {
  const code = (value || "").trim().toUpperCase();
  if (!code) return "";
  return code === "ZWL" ? "ZWG" : code;
};

function isRefundReturnMove(move: StockMove) {
  const notes = (move.notes || "").toLowerCase();
  const source = (move.source_document || "").toLowerCase();
  return (
    move.move_type === "in" &&
    (notes.includes("pos refund return") || source.startsWith("pos-ord-"))
  );
}

function getMoveTypeLabel(move: StockMove) {
  if (isRefundReturnMove(move)) return "Returned";
  return (
    MOVE_TYPES.find((type) => type.value === move.move_type)?.label ||
    move.move_type
  );
}

function getStockMoveSortValue(move: StockMove) {
  const primary = move.done_date || move.scheduled_date;
  const timestamp = primary ? new Date(primary).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatStockMoveDate(move: StockMove) {
  const value = move.done_date || move.scheduled_date;
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATES = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRODUCT_TYPES = [
  { value: "storable", label: "Storable Product" },
  { value: "consumable", label: "Consumable" },
  { value: "service", label: "Service" },
];

const UOMS = [
  { value: "Units", label: "Units" },
  { value: "KG", label: "Kilograms" },
  { value: "L", label: "Liters" },
  { value: "M", label: "Meters" },
  { value: "BOX", label: "Box" },
  { value: "PACK", label: "Pack" },
];

const PRODUCT_IMPORT_HEADER_ALIASES = {
  product: ["product", "name", "productname"],
  reference: ["reference", "ref", "productreference"],
  location: ["location", "stocklocation"],
  category: ["category", "productcategory"],
  type: ["type", "producttype"],
  on_hand: ["onhand", "qtyonhand", "quantityonhand", "qty", "quantity"],
  sale_price: ["saleprice", "price", "sellingprice"],
  sale_cost: ["salecost", "salescost"],
  cost: ["cost", "purchasecost", "unitcost"],
};

type MainView =
  | "overview"
  | "products"
  | "categories"
  | "warehouses"
  | "operations"
  | "reporting";
type SubView = "list" | "kanban" | "form";
type InventoryIconProps = { color?: string };

const OverviewIcon = ({ color }: InventoryIconProps) => (
  <LayoutDashboard
    strokeWidth={1}
    size={24}
    color={color ?? "currentColor"}
    aria-hidden
  />
);

const ProductsIcon = ({ color }: InventoryIconProps) => (
  <ShoppingBasket
    strokeWidth={1}
    size={24}
    color={color ?? "currentColor"}
    aria-hidden
  />
);

const CategoriesIcon = ({ color }: InventoryIconProps) => (
  <LayoutGrid
    strokeWidth={1}
    size={24}
    color={color ?? "currentColor"}
    aria-hidden
  />
);

const WarehousesIcon = ({ color }: InventoryIconProps) => (
  <Warehouse
    strokeWidth={1}
    size={24}
    color={color ?? "currentColor"}
    aria-hidden
  />
);

type MenuTab = {
  key: Exclude<MainView, "operations" | "reporting">;
  label: string;
  color: string;
  background: string;
  icon: (props: InventoryIconProps) => JSX.Element;
};

const BASE_MENU_TABS: MenuTab[] = [
  {
    key: "overview",
    label: "OVERVIEW",
    color: "var(--blue-600)",
    background: "rgba(59, 130, 246, 0.12)",
    icon: OverviewIcon,
  },
  {
    key: "products",
    label: "PRODUCTS",
    color: "var(--amber-500)",
    background: "rgba(251, 191, 36, 0.15)",
    icon: ProductsIcon,
  },
  {
    key: "categories",
    label: "PRODUCT CATEGORIES",
    color: "var(--indigo-500)",
    background: "rgba(99, 102, 241, 0.15)",
    icon: CategoriesIcon,
  },
  {
    key: "warehouses",
    label: "WAREHOUSES",
    color: "var(--emerald-500)",
    background: "rgba(16, 185, 129, 0.15)",
    icon: WarehousesIcon,
  },
];

const TrashIcon = () => <Trash2 size={16} strokeWidth={2} aria-hidden="true" />;

const EditIcon = () => <PenLine size={16} strokeWidth={2} aria-hidden="true" />;

export default function InventoryPage() {
  const navigate = useNavigate();
  const { me } = useMe();
  const { companies, loading: companiesLoading } = useCompanies();
  const isAdmin = Boolean(me?.is_admin);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const [newCountLines, setNewCountLines] = useState<NewStockCountLine[]>([]);

  const addNewCountLine = () => {
    setNewCountLines((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        product_id: null,
        warehouse_id: warehouses[0]?.id ?? null,
        location_id: null,
        quantity: "0",
      },
    ]);
  };

  const removeNewCountLine = (id: string) => {
    setNewCountLines((prev) => prev.filter((line) => line.id !== id));
  };

  const filteredCompanies = useMemo(() => {
    if (!companyQuery.trim()) return companies;
    const q = companyQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q)) ||
        (c.vat && c.vat.toLowerCase().includes(q)),
    );
  }, [companies, companyQuery]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;
  const { showAlert, showConfirm } = useAlert();

  const showAlertMessage = (
    message: ReactNode,
    variant: AlertModalVariant = "danger",
  ) => showAlert({ message, variant });

  const showInfoAlert = (message: ReactNode) =>
    showAlertMessage(message, "success");
  const showWarningAlert = (message: ReactNode) =>
    showAlertMessage(message, "warning");
  const showDangerAlert = (message: ReactNode) =>
    showAlertMessage(message, "danger");

  const showMultilineAlert = (text: string) =>
    showDangerAlert(
      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{text}</pre>,
    );

  const [mainView, setMainView] = useState<MainView>("overview");
  const [subView, setSubView] = useState<SubView>("list");

  // Data states
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [stockMoves, setStockMoves] = useState<StockMove[]>([]);
  const [stockQuants, setStockQuants] = useState<StockQuant[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSetting[]>([]);
  const [companySettings, setCompanySettings] =
    useState<CompanySettings | null>(null);

  // UI states
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [productFilterMenuOpen, setProductFilterMenuOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(
    new Set(),
  );
  const [exportingSelectedProducts, setExportingSelectedProducts] =
    useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsPageSize, setProductsPageSize] = useState(20);

  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [importExportTarget, setImportExportTarget] = useState<
    "products" | "moves"
  >("products");

  // Operations sub-tab
  const [operationsTab, setOperationsTab] = useState<
    "moves" | "quants" | "adjustments"
  >("moves");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterMoveType, setFilterMoveType] = useState<string>("all");
  const [filterCurrency, setFilterCurrency] = useState<string>("");
  const [operationCurrencies, setOperationCurrencies] = useState<string[]>([]);
  const [countedByQuantId, setCountedByQuantId] = useState<
    Record<number, string>
  >({});
  const [expandedQuantGroupKeys, setExpandedQuantGroupKeys] = useState<
    Set<string>
  >(new Set());
  const [quantGroupPages, setQuantGroupPages] = useState<
    Record<string, number>
  >({});
  const [showOnlyChangedAdjustments, setShowOnlyChangedAdjustments] =
    useState(false);
  const [applyingAdjustments, setApplyingAdjustments] = useState(false);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(
    new Set(),
  );
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (!filterMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterMenuOpen]);

  useEffect(() => {
    if (!(mainView === "operations" && operationsTab === "moves")) {
      setFilterMenuOpen(false);
    }
  }, [mainView, operationsTab]);

  useEffect(() => {
    if (!companyId) {
      setOperationCurrencies([]);
      setFilterCurrency("");
      return;
    }

    let cancelled = false;
    void apiFetch<CurrencyItem[]>(
      `/currencies?company_id=${companyId}&active_only=true`,
    )
      .then((currencies) => {
        if (cancelled) return;
        const codes = Array.from(
          new Set(
            currencies
              .map((cur) => normalizeCurrencyCode(cur.code))
              .filter((code): code is string => Boolean(code)),
          ),
        );
        setOperationCurrencies(codes.length ? codes : ["USD"]);
        setFilterCurrency("");
      })
      .catch(() => {
        if (cancelled) return;
        setOperationCurrencies(["USD"]);
        setFilterCurrency("");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!productFilterMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        productFilterMenuRef.current &&
        !productFilterMenuRef.current.contains(event.target as Node)
      ) {
        setProductFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [productFilterMenuOpen]);

  useEffect(() => {
    if (!(mainView === "products" && subView === "list")) {
      setProductFilterMenuOpen(false);
    }
  }, [mainView, subView]);

  const menuSections = useMemo<SidebarSection[]>(() => {
    const baseItems = BASE_MENU_TABS.map((tab) => ({
      id: `menu-${tab.key}`,
      label: tab.label,
      icon: <tab.icon color={tab.color} />,
      iconColor: tab.color,
      iconBackground: tab.background,
      isActive: mainView === tab.key,
      onClick: () => {
        setMainView(tab.key);
        setSubView("list");
        setSearchQuery("");
      },
    }));

    const operationsIconStyle = {
      color: "var(--teal-600)",
      background: "rgba(20, 184, 166, 0.15)",
    };
    const operationsItem = {
      id: "menu-operations",
      label: "OPERATIONS",
      icon: (
        <ArrowRightLeft
          strokeWidth={1}
          size={24}
          aria-hidden
          color={operationsIconStyle.color}
        />
      ),
      isActive: mainView === "operations",
      onClick: () => {
        setMainView("operations");
        setSubView("list");
        setSearchQuery("");
      },
      iconColor: operationsIconStyle.color,
      iconBackground: operationsIconStyle.background,
      dropdownItems: [
        {
          id: "operations-moves",
          label: "Stock Moves",
          isActive: mainView === "operations" && operationsTab === "moves",
          onClick: () => {
            setMainView("operations");
            setSubView("list");
            setSearchQuery("");
            setOperationsTab("moves");
          },
        },
        {
          id: "operations-quants",
          label: "Stock On Hand",
          isActive: mainView === "operations" && operationsTab === "quants",
          onClick: () => {
            setMainView("operations");
            setSubView("list");
            setSearchQuery("");
            setOperationsTab("quants");
          },
        },
        {
          id: "operations-adjustments",
          label: "Stock Count",
          isActive:
            mainView === "operations" && operationsTab === "adjustments",
          onClick: () => {
            setMainView("operations");
            setSubView("list");
            setSearchQuery("");
            setOperationsTab("adjustments");
          },
        },
      ],
    };

    return [
      {
        id: "main-menu",
        title: "MENU",
        items: [...baseItems, operationsItem],
      },
    ];
  }, [
    mainView,
    operationsTab,
    setMainView,
    setSubView,
    setOperationsTab,
    setSearchQuery,
  ]);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(
    null,
  );
  const [selectedMoveId, setSelectedMoveId] = useState<number | null>(null);
  const [journalPreviewOpen, setJournalPreviewOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    null,
  );
  const [isNew, setIsNew] = useState(false);

  // Product form
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    reference: "",
    barcode: "",
    category_id: null as number | null,
    product_type: "storable",
    uom: "Units",
    sale_price: 0,
    sales_cost: 0,
    purchase_cost: 0,
    tax_rate: 15,
    tax_id: null as number | null,
    hs_code: "",
    track_inventory: true,
    min_stock_quantity: 0,
    max_stock_quantity: 0,
    reorder_point: 0,
    weight: 0,
    weight_uom: "kg",
    is_active: true,
    can_be_sold: true,
    can_be_purchased: true,
    show_in_pos: true,
  });
  const [invalidProductFields, setInvalidProductFields] = useState<string[]>(
    [],
  );
  const [productInfoTab, setProductInfoTab] = useState<
    "general" | "inventory" | "description" | "location"
  >("general");
  useEffect(() => {
    if (
      productForm.product_type !== "storable" &&
      productInfoTab === "inventory"
    ) {
      setProductInfoTab("general");
    }
  }, [productForm.product_type, productInfoTab]);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [pendingProductImageFile, setPendingProductImageFile] =
    useState<File | null>(null);
  const [pendingProductImagePreviewUrl, setPendingProductImagePreviewUrl] =
    useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const productImportInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const productFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const [importingProducts, setImportingProducts] = useState(false);

  const clearPendingProductImage = () => {
    if (pendingProductImagePreviewUrl) {
      URL.revokeObjectURL(pendingProductImagePreviewUrl);
    }
    setPendingProductImageFile(null);
    setPendingProductImagePreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      if (pendingProductImagePreviewUrl) {
        URL.revokeObjectURL(pendingProductImagePreviewUrl);
      }
    };
  }, [pendingProductImagePreviewUrl]);

  // Warehouse form
  const [warehouseForm, setWarehouseForm] = useState({
    name: "",
    code: "",
    address: "",
  });

  // Location form
  const [locationForm, setLocationForm] = useState({
    warehouse_id: null as number | null,
    name: "",
    code: "",
    is_primary: false,
    is_scrap: false,
  });
  const [invalidLocationFields, setInvalidLocationFields] = useState<string[]>(
    [],
  );
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Stock move form
  const [moveForm, setMoveForm] = useState({
    product_id: null as number | null,
    warehouse_id: null as number | null,
    location_id: null as number | null,
    move_type: "in",
    quantity: 0,
    unit_cost: 0,
    reference: "",
    source_document: "",
    notes: "",
  });
  const moveLineIdRef = useRef(0);
  const createMoveLine = (
    overrides: Partial<StockMoveLineInput> = {},
  ): StockMoveLineInput => {
    moveLineIdRef.current += 1;
    return {
      line_id: `ml-${moveLineIdRef.current}`,
      product_id: null,
      quantity: 0,
      unit_cost: 0,
      ...overrides,
    };
  };
  const [moveLines, setMoveLines] = useState<StockMoveLineInput[]>([]);
  const [invalidMoveFields, setInvalidMoveFields] = useState<string[]>([]);
  const [quickStockWarehouseId, setQuickStockWarehouseId] = useState<
    number | null
  >(null);
  const [quickStockLocationId, setQuickStockLocationId] = useState<
    number | null
  >(null);
  const [quickStockQuantity, setQuickStockQuantity] = useState("0");
  const [quickAdjustingStock, setQuickAdjustingStock] = useState(false);

  // Category form
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );
  const [categoryForm, setCategoryForm] = useState({ name: "" });
  const [invalidCategoryFields, setInvalidCategoryFields] = useState<string[]>(
    [],
  );
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [filterWarehouseId, setFilterWarehouseId] = useState<number | null>(
    null,
  );
  const [filterLocationId, setFilterLocationId] = useState<number | null>(null);

  // ============= EFFECTS =============
  // Portal users auto-select their first company
  useEffect(() => {
    if (!isAdmin && companies.length && companyId === null) {
      setCompanyId(companies[0].id);
    }
  }, [isAdmin, companies, companyId]);

  useEffect(() => {
    if (companyId) {
      loadAllData();
    }
  }, [companyId]);

  useEffect(() => {
    if (!stockQuants.length) {
      setCountedByQuantId({});
      return;
    }
    setCountedByQuantId((previous) => {
      const next: Record<number, string> = {};
      stockQuants.forEach((quant) => {
        const defaultQty = Number.isFinite(quant.quantity) ? quant.quantity : 0;
        next[quant.id] = previous[quant.id] ?? String(defaultQty);
      });
      return next;
    });
  }, [stockQuants]);

  useEffect(() => {
    if (operationsTab !== "moves") {
      setFilterMoveType("all");
    }
  }, [operationsTab]);

  // ============= DATA LOADING =============
  const loadAllData = async () => {
    if (!companyId) {
      console.log("loadAllData skipped - no companyId");
      return;
    }
    console.log("loadAllData starting for companyId:", companyId);
    setLoading(true);
    try {
      const [prods, cats, whs, moves, quants, taxes, settings] =
        await Promise.all([
          apiFetch<ProductWithStock[]>(
            `/products/with-stock?company_id=${companyId}`,
          ),
          apiFetch<Category[]>(`/categories?company_id=${companyId}`),
          apiFetch<Warehouse[]>(`/warehouses?company_id=${companyId}`),
          apiFetch<StockMove[]>(`/stock/moves?company_id=${companyId}`),
          apiFetch<StockQuant[]>(`/stock/quants?company_id=${companyId}`),
          apiFetch<TaxSetting[]>(`/tax-settings?company_id=${companyId}`),
          apiFetch<CompanySettings>(
            `/company-settings?company_id=${companyId}`,
          ),
        ]);
      console.log("loadAllData results:", {
        prods: prods.length,
        cats: cats.length,
        whs: whs.length,
        moves: moves.length,
        quants: quants.length,
      });
      console.log("Warehouses loaded:", whs);
      const stockValueByProductId = new Map<number, number>();
      for (const quant of quants) {
        const current = stockValueByProductId.get(quant.product_id) ?? 0;
        stockValueByProductId.set(
          quant.product_id,
          current +
            (Number.isFinite(quant.total_value) ? quant.total_value : 0),
        );
      }
      const productsWithStockValue = prods.map((p) => {
        const valueFromQuants = stockValueByProductId.get(p.id);
        const computedValue =
          valueFromQuants ??
          (Number.isFinite(p.quantity_on_hand) &&
          Number.isFinite(p.purchase_cost)
            ? p.quantity_on_hand * p.purchase_cost
            : 0);
        return { ...p, stock_value: computedValue };
      });
      setProducts(productsWithStockValue);
      setCategories(cats);
      setWarehouses(whs);
      setStockMoves(moves);
      setStockQuants(quants);
      setTaxSettings(taxes);
      setCompanySettings(settings ?? null);

      // Load locations for all warehouses
      if (whs.length) {
        const allLocs = await Promise.all(
          whs.map((w) =>
            apiFetch<Location[]>(`/locations?warehouse_id=${w.id}`),
          ),
        );
        setLocations(allLocs.flat());
      }
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setLoading(false);
    }
  };

  // ============= PRODUCT ACTIONS =============
  const startNewProduct = () => {
    setSelectedProductId(null);
    setIsNew(true);
    setProductImageUrl("");
    clearPendingProductImage();
    setProductForm({
      name: "",
      description: "",
      reference: "",
      barcode: "",
      category_id: null,
      product_type: "storable",
      uom: "Units",
      sale_price: 0,
      sales_cost: 0,
      purchase_cost: 0,
      tax_rate: 15,
      tax_id: null,
      hs_code: "",
      track_inventory: true,
      min_stock_quantity: 0,
      max_stock_quantity: 0,
      reorder_point: 0,
      weight: 0,
      weight_uom: "kg",
      is_active: true,
      can_be_sold: true,
      can_be_purchased: true,
      show_in_pos: true,
    });
    setSubView("form");
    setInvalidProductFields([]);
  };

  const clearInvalidProductField = (key: string, value: unknown) => {
    if (!invalidProductFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidProductFields((prev) => prev.filter((field) => field !== key));
  };

  const validateInventoryProductFields = (): boolean => {
    const requiredFields = [
      { key: "name", label: "Product name", value: productForm.name },
      { key: "uom", label: "Unit of measure", value: productForm.uom },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidProductFields(missingFields.map((field) => field.key));
      return false;
    }
    setInvalidProductFields([]);
    setError(null);
    return true;
  };

  const openProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setIsNew(false);
    clearPendingProductImage();
    setProductImageUrl(product.image_url || "");
    setProductForm({
      name: product.name,
      description: product.description,
      reference: product.reference,
      barcode: product.barcode,
      category_id: product.category_id,
      product_type: product.product_type,
      uom: product.uom,
      sale_price: product.sale_price,
      sales_cost: product.sales_cost,
      purchase_cost: product.purchase_cost,
      tax_rate: product.tax_rate,
      tax_id: product.tax_id ?? null,
      hs_code: product.hs_code,
      track_inventory: product.track_inventory,
      min_stock_quantity: product.min_stock_quantity,
      max_stock_quantity: product.max_stock_quantity,
      reorder_point: product.reorder_point,
      weight: product.weight,
      weight_uom: product.weight_uom,
      is_active: product.is_active,
      can_be_sold: product.can_be_sold,
      can_be_purchased: product.can_be_purchased,
      show_in_pos: product.show_in_pos ?? true,
    });
    setInvalidProductFields([]);
    setSubView("form");
  };

  const saveProduct = async () => {
    if (!companyId) {
      showWarningAlert("Please select a company first.");
      return;
    }
    if (!validateInventoryProductFields()) return;
    if (Number(productForm.sale_price) < 0) {
      showWarningAlert("Sale price cannot be negative.");
      return;
    }
    if (Number(productForm.tax_rate) < 0) {
      showWarningAlert("Tax rate cannot be negative.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...productForm, company_id: companyId };
      if (selectedProductId && !isNew) {
        await apiFetch(`/products/${selectedProductId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiFetch<Product>("/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (pendingProductImageFile) {
          setUploadingImage(true);
          try {
            const fd = new FormData();
            fd.append("file", pendingProductImageFile);
            await apiFetch<Product>(`/products/${created.id}/image`, {
              method: "POST",
              body: fd,
            });
          } catch (err: any) {
            showDangerAlert(
              err?.message ||
                "Product was created, but image upload failed. You can upload it from the product form.",
            );
          } finally {
            setUploadingImage(false);
            clearPendingProductImage();
          }
        }
      }
      await loadAllData();
      setSubView("list");
      setIsNew(false);
      setInvalidMoveFields([]);
    } finally {
      setSaving(false);
    }
  };

  const handleProductImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    if (!selectedProductId) {
      if (pendingProductImagePreviewUrl) {
        URL.revokeObjectURL(pendingProductImagePreviewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setPendingProductImageFile(file);
      setPendingProductImagePreviewUrl(previewUrl);
      setProductImageUrl(previewUrl);
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await apiFetch<Product>(
        `/products/${selectedProductId}/image`,
        {
          method: "POST",
          body: fd,
        },
      );
      setProductImageUrl(updated.image_url || "");
    } catch (err: any) {
      showDangerAlert(err.message || "Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleProductImageDelete = async () => {
    if (!selectedProductId) {
      clearPendingProductImage();
      setProductImageUrl("");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    if (!selectedProductId) return;
    setUploadingImage(true);
    try {
      const updated = await apiFetch<Product>(
        `/products/${selectedProductId}/image`,
        { method: "DELETE" },
      );
      setProductImageUrl(updated.image_url || "");
    } catch {
      showDangerAlert("Failed to remove image");
    } finally {
      setUploadingImage(false);
    }
  };

  const deleteProduct = async (productId: number) => {
    const confirmed = await showConfirm({
      title: "Delete product",
      message: "Are you sure you want to delete this product?",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await apiFetch(`/products/${productId}`, { method: "DELETE" });
      await loadAllData();
      setSubView("list");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedProducts = async () => {
    if (!selectedProductIds.size) return;
    const confirmedDeleted = await showConfirm({
      title: "Delete selected products",
      message: `Are you sure you want to delete ${selectedProductIds.size} selected product${selectedProductIds.size === 1 ? "" : "s"}?`,
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmedDeleted) {
      return;
    }
    setSaving(true);
    try {
      const failures: string[] = [];
      for (const product of filteredProducts.filter((item) =>
        selectedProductIds.has(item.id),
      )) {
        try {
          await apiFetch(`/products/${product.id}`, { method: "DELETE" });
        } catch (err: any) {
          failures.push(`${product.name}: ${err?.message || "Delete failed"}`);
        }
      }
      await loadAllData();
      setSelectedProductIds(new Set());
      setSubView("list");
      if (failures.length) {
        showMultilineAlert(failures.join("\n"));
      }
    } finally {
      setSaving(false);
    }
  };

  const normalizeImportHeader = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");

  const normalizeImportValue = (value: unknown) => String(value ?? "").trim();

  const findImportColumnIndex = (
    headers: string[],
    candidates: readonly string[],
  ) => headers.findIndex((header) => candidates.includes(header));

  const toImportQuantity = (value: unknown) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const cleaned = String(value ?? "")
      .trim()
      .replace(/,/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const mapImportedProductType = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return "storable";
    if (
      normalized.includes("service") ||
      normalized === "srv" ||
      normalized === "services"
    ) {
      return "service";
    }
    if (
      normalized.includes("consum") ||
      normalized === "consumable" ||
      normalized === "consume"
    ) {
      return "consumable";
    }
    return "storable";
  };

  const buildImportCode = (
    label: string,
    existingCodes: Set<string>,
    fallbackPrefix: string,
  ) => {
    const base =
      label
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8) || fallbackPrefix;
    let candidate = base;
    let suffix = 1;
    while (existingCodes.has(candidate)) {
      candidate = `${base.slice(0, Math.max(2, 8 - String(suffix).length))}${suffix}`;
      suffix += 1;
    }
    existingCodes.add(candidate);
    return candidate;
  };

  const resolveImportLocationNames = (rawLocation: string) => {
    const cleaned = rawLocation.trim();
    if (!cleaned) {
      return { warehouseName: "Main Warehouse", locationName: "Stock" };
    }
    const parts = cleaned
      .split(/\s*(?:\/|>|\\|\|)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return {
        warehouseName: parts[0],
        locationName: parts[1],
      };
    }
    return { warehouseName: "Main Warehouse", locationName: cleaned };
  };

  const handleProductsImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!companyId) {
      showWarningAlert("Please select a company first.");
      return;
    }

    setImportingProducts(true);
    setError(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        throw new Error("No sheet found in the selected file.");
      }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
        header: 1,
        defval: "",
      }) as (string | number | null)[][];
      if (rows.length < 2) {
        throw new Error(
          "The import file is empty. Add headers and at least one product row.",
        );
      }

      const headers = (rows[0] ?? []).map(normalizeImportHeader);
      const productIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.product,
      );
      const referenceIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.reference,
      );
      const locationIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.location,
      );
      const categoryIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.category,
      );
      const typeIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.type,
      );
      const onHandIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.on_hand,
      );
      const salePriceIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.sale_price,
      );
      const saleCostIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.sale_cost,
      );
      const costIndex = findImportColumnIndex(
        headers,
        PRODUCT_IMPORT_HEADER_ALIASES.cost,
      );

      if (productIndex === -1) {
        throw new Error(
          "Missing Product column. Expected headers: Product, Reference, Location, Category, Type, On Hand, Sale Price, Sale Cost, Cost.",
        );
      }

      const localCategories = [...categories];
      const localWarehouses = [...warehouses];
      const localLocations = [...locations];
      const categoryByName = new Map(
        localCategories.map((category) => [
          category.name.trim().toLowerCase(),
          category,
        ]),
      );
      const warehouseByName = new Map(
        localWarehouses.map((warehouse) => [
          warehouse.name.trim().toLowerCase(),
          warehouse,
        ]),
      );
      const locationByKey = new Map(
        localLocations.map((location) => [
          `${location.warehouse_id}:${location.name.trim().toLowerCase()}`,
          location,
        ]),
      );
      const warehouseCodes = new Set(
        localWarehouses.map((warehouse) => warehouse.code.trim().toUpperCase()),
      );
      const locationCodes = new Set(
        localLocations.map((location) => location.code.trim().toUpperCase()),
      );

      const ensureCategory = async (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const key = trimmed.toLowerCase();
        const existing = categoryByName.get(key);
        if (existing) return existing.id;
        const created = await apiFetch<Category>("/categories", {
          method: "POST",
          body: JSON.stringify({ company_id: companyId, name: trimmed }),
        });
        localCategories.push(created);
        categoryByName.set(key, created);
        return created.id;
      };

      const ensureLocation = async (rawLocation: string) => {
        const { warehouseName, locationName } =
          resolveImportLocationNames(rawLocation);
        const warehouseKey = warehouseName.trim().toLowerCase();
        let warehouse = warehouseByName.get(warehouseKey);
        if (!warehouse) {
          warehouse = await apiFetch<Warehouse>("/warehouses", {
            method: "POST",
            body: JSON.stringify({
              company_id: companyId,
              name: warehouseName,
              code: buildImportCode(warehouseName, warehouseCodes, "WH"),
              address: "",
            }),
          });
          localWarehouses.push(warehouse);
          warehouseByName.set(warehouseKey, warehouse);
        }

        const locationKey = `${warehouse.id}:${locationName.trim().toLowerCase()}`;
        let location = locationByKey.get(locationKey);
        if (!location) {
          location = await apiFetch<Location>("/locations", {
            method: "POST",
            body: JSON.stringify({
              warehouse_id: warehouse.id,
              name: locationName,
              code: buildImportCode(locationName, locationCodes, "LOC"),
              is_primary: localLocations.every(
                (entry) => entry.warehouse_id !== warehouse!.id,
              ),
            }),
          });
          localLocations.push(location);
          locationByKey.set(locationKey, location);
        }
        return {
          warehouseId: warehouse.id,
          locationId: location.id,
        };
      };

      const existingProductsByReference = new Map<string, Product>(
        products
          .filter((product) => product.reference?.trim())
          .map((product) => [product.reference.trim().toLowerCase(), product]),
      );
      const existingProductsByName = new Map<string, Product>(
        products.map((product) => [product.name.trim().toLowerCase(), product]),
      );

      let importedCount = 0;
      let adjustedCount = 0;
      const rowErrors: string[] = [];

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        const productName = normalizeImportValue(row[productIndex]);
        const reference =
          referenceIndex >= 0 ? normalizeImportValue(row[referenceIndex]) : "";
        const locationLabel =
          locationIndex >= 0 ? normalizeImportValue(row[locationIndex]) : "";
        const categoryName =
          categoryIndex >= 0 ? normalizeImportValue(row[categoryIndex]) : "";
        const typeLabel =
          typeIndex >= 0 ? normalizeImportValue(row[typeIndex]) : "";
        const onHand =
          onHandIndex >= 0 ? toImportQuantity(row[onHandIndex]) : 0;
        const salePrice =
          salePriceIndex >= 0
            ? toImportQuantity(row[salePriceIndex])
            : existingProductsByReference.get(reference.trim().toLowerCase())
                ?.sale_price ||
              existingProductsByName.get(productName.trim().toLowerCase())
                ?.sale_price ||
              0;
        const saleCost =
          saleCostIndex >= 0
            ? toImportQuantity(row[saleCostIndex])
            : existingProductsByReference.get(reference.trim().toLowerCase())
                ?.sales_cost ||
              existingProductsByName.get(productName.trim().toLowerCase())
                ?.sales_cost ||
              0;
        const purchaseCost =
          costIndex >= 0
            ? toImportQuantity(row[costIndex])
            : existingProductsByReference.get(reference.trim().toLowerCase())
                ?.purchase_cost ||
              existingProductsByName.get(productName.trim().toLowerCase())
                ?.purchase_cost ||
              0;

        const isRowEmpty =
          [
            productName,
            reference,
            locationLabel,
            categoryName,
            typeLabel,
          ].every((value) => !value) &&
          onHand === 0 &&
          salePrice === 0 &&
          saleCost === 0 &&
          purchaseCost === 0;
        if (isRowEmpty) {
          continue;
        }
        if (!productName) {
          rowErrors.push(`Row ${rowIndex + 1}: Product is required.`);
          continue;
        }

        try {
          const categoryId = await ensureCategory(categoryName);
          const mappedType = mapImportedProductType(typeLabel);
          const existingProduct =
            (reference &&
              existingProductsByReference.get(
                reference.trim().toLowerCase(),
              )) ||
            existingProductsByName.get(productName.trim().toLowerCase()) ||
            null;
          const productPayload = {
            company_id: companyId,
            name: productName,
            description: existingProduct?.description || "",
            reference,
            barcode: existingProduct?.barcode || "",
            category_id: categoryId,
            product_type: mappedType,
            uom: existingProduct?.uom || "Units",
            sale_price: salePrice,
            sales_cost: saleCost,
            purchase_cost: purchaseCost,
            tax_rate: existingProduct?.tax_rate || 15,
            tax_id: existingProduct?.tax_id ?? null,
            hs_code: existingProduct?.hs_code || "",
            track_inventory: existingProduct?.track_inventory ?? true,
            min_stock_quantity: existingProduct?.min_stock_quantity || 0,
            max_stock_quantity: existingProduct?.max_stock_quantity || 0,
            reorder_point: existingProduct?.reorder_point || 0,
            weight: existingProduct?.weight || 0,
            weight_uom: existingProduct?.weight_uom || "kg",
            is_active: existingProduct?.is_active ?? true,
            can_be_sold: existingProduct?.can_be_sold ?? true,
            can_be_purchased: existingProduct?.can_be_purchased ?? true,
            show_in_pos: existingProduct?.show_in_pos ?? true,
          };

          const savedProduct = existingProduct
            ? await apiFetch<Product>(`/products/${existingProduct.id}`, {
                method: "PATCH",
                body: JSON.stringify(productPayload),
              })
            : await apiFetch<Product>("/products", {
                method: "POST",
                body: JSON.stringify(productPayload),
              });

          existingProductsByName.set(
            productName.trim().toLowerCase(),
            savedProduct,
          );
          if (reference) {
            existingProductsByReference.set(
              reference.trim().toLowerCase(),
              savedProduct,
            );
          }
          importedCount += 1;

          if (onHand > 0) {
            const { warehouseId, locationId } =
              await ensureLocation(locationLabel);
            const move = await apiFetch<StockMove>("/stock/moves", {
              method: "POST",
              body: JSON.stringify({
                company_id: companyId,
                product_id: savedProduct.id,
                warehouse_id: warehouseId,
                location_id: locationId,
                move_type: "adjustment",
                quantity: onHand,
                unit_cost:
                  Number.isFinite(savedProduct.purchase_cost) &&
                  savedProduct.purchase_cost > 0
                    ? savedProduct.purchase_cost
                    : 0,
                reference: "",
                source_document: `Product import: ${file.name}`,
                notes: `Imported opening stock for ${productName}`,
              }),
            });
            await apiFetch(`/stock/moves/${move.id}/confirm`, {
              method: "POST",
            });
            adjustedCount += 1;
          }
        } catch (error: any) {
          rowErrors.push(
            `Row ${rowIndex + 1}: ${error?.message || "Import failed."}`,
          );
        }
      }

      await loadAllData();
      if (!importedCount && rowErrors.length) {
        throw new Error(rowErrors.slice(0, 5).join(" "));
      }
      if (rowErrors.length) {
        setError(rowErrors.slice(0, 5).join(" "));
      }
      showInfoAlert(
        `Imported ${importedCount} product${importedCount === 1 ? "" : "s"}${
          adjustedCount
            ? ` and applied stock to ${adjustedCount} item${
                adjustedCount === 1 ? "" : "s"
              }`
            : ""
        }.`,
      );
    } catch (error: any) {
      setError(error?.message || "Failed to import products.");
    } finally {
      setImportingProducts(false);
    }
  };

  const exportProducts = (format: "csv" | "xlsx") => {
    const rows = filteredProducts.map((product) => {
      const category = categories.find(
        (entry) => entry.id === product.category_id,
      );
      return {
        Product: product.name,
        Reference: product.reference || "",
        Location: productLocationById.get(product.id) || "",
        Category: category?.name || "",
        Type:
          PRODUCT_TYPES.find((entry) => entry.value === product.product_type)
            ?.label || product.product_type,
        "On Hand": Number.isFinite(product.quantity_on_hand)
          ? product.quantity_on_hand
          : 0,
        Available: Number.isFinite(product.quantity_available)
          ? product.quantity_available
          : 0,
        "Sale Price": Number.isFinite(product.sale_price)
          ? product.sale_price
          : 0,
        "Sale Cost": Number.isFinite(product.sales_cost)
          ? product.sales_cost
          : 0,
        Cost: Number.isFinite(product.purchase_cost)
          ? product.purchase_cost
          : 0,
        "Stock Value": Number.isFinite(product.stock_value)
          ? product.stock_value
          : 0,
      };
    });
    if (!rows.length) {
      showWarningAlert("There are no products to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `inventory_products_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
    XLSX.writeFile(
      workbook,
      `inventory_products_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const exportStockMoves = (format: "csv" | "xlsx") => {
    const rows = filteredMoves.map((move) => {
      const product = products.find((entry) => entry.id === move.product_id);
      const warehouse = warehouses.find(
        (entry) => entry.id === move.warehouse_id,
      );
      return {
        Reference:
          move.reference || `WH/MOV/${String(move.id).padStart(5, "0")}`,
        Date: formatStockMoveDate(move),
        Product: product?.name || "",
        Type: getMoveTypeLabel(move),
        Warehouse: warehouse?.name || "",
        Quantity: Number.isFinite(move.quantity) ? move.quantity : 0,
        UOM: product?.uom || "Units",
        "Unit Cost": Number.isFinite(move.unit_cost) ? move.unit_cost : 0,
        Total: Number.isFinite(move.total_cost) ? move.total_cost : 0,
        Status:
          STATES.find((entry) => entry.value === move.state)?.label ||
          move.state,
        "Source Document": move.source_document || "",
      };
    });
    if (!rows.length) {
      showWarningAlert("There are no stock moves to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `inventory_stock_moves_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Moves");
    XLSX.writeFile(
      workbook,
      `inventory_stock_moves_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  // ============= WAREHOUSE ACTIONS =============
  const startNewWarehouse = () => {
    setSelectedWarehouseId(null);
    setIsNew(true);
    setWarehouseForm({ name: "", code: "", address: "" });
    setSubView("form");
  };

  const openWarehouse = (warehouse: Warehouse) => {
    setSelectedWarehouseId(warehouse.id);
    setIsNew(false);
    setWarehouseForm({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
    });
    setSubView("form");
  };

  const openWarehouseProducts = (warehouseId: number) => {
    setFilterWarehouseId(warehouseId);
    setFilterLocationId(null);
    setMainView("products");
    setSubView("list");
  };

  const openLocationProducts = (warehouseId: number, locationId: number) => {
    setFilterWarehouseId(warehouseId);
    setFilterLocationId(locationId);
    setMainView("products");
    setSubView("list");
  };

  const saveWarehouse = async () => {
    console.log("saveWarehouse called", {
      companyId,
      warehouseForm,
      selectedWarehouseId,
      isNew,
    });
    if (!companyId) {
      showWarningAlert("Please select a company first");
      return;
    }
    if (!warehouseForm.name) {
      showWarningAlert("Please enter a warehouse name");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...warehouseForm, company_id: companyId };
      console.log("saveWarehouse payload:", payload);
      if (selectedWarehouseId && !isNew) {
        console.log("PATCH warehouse", selectedWarehouseId);
        await apiFetch(`/warehouses/${selectedWarehouseId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        console.log("POST new warehouse");
        await apiFetch("/warehouses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      console.log("saveWarehouse success, loading data");
      await loadAllData();
      setSubView("list");
      setIsNew(false);
    } catch (err) {
      console.error("Error saving warehouse:", err);
      showDangerAlert(
        "Error saving warehouse: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteWarehouse = async (warehouseId: number) => {
    const confirmed = await showConfirm({
      title: "Delete warehouse",
      message:
        "Are you sure you want to delete this warehouse? This will also delete all its locations.",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await apiFetch(`/warehouses/${warehouseId}`, { method: "DELETE" });
      await loadAllData();
      setSubView("list");
    } finally {
      setSaving(false);
    }
  };

  // ============= LOCATION ACTIONS =============
  const openLocationModal = (location?: Location) => {
    if (location) {
      setSelectedLocationId(location.id);
      setLocationForm({
        warehouse_id: location.warehouse_id,
        name: location.name,
        code: location.code,
        is_primary: location.is_primary,
        is_scrap: location.is_scrap,
      });
    } else {
      setSelectedLocationId(null);
      setLocationForm({
        warehouse_id: warehouses[0]?.id ?? null,
        name: "",
        code: "",
        is_primary: false,
        is_scrap: false,
      });
    }
    setInvalidLocationFields([]);
    setShowLocationModal(true);
  };

  const clearInvalidLocationField = (key: string, value: unknown) => {
    if (!invalidLocationFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidLocationFields((prev) => prev.filter((field) => field !== key));
  };

  const validateLocationRequiredFields = (): boolean => {
    const requiredFields = [
      {
        key: "warehouse",
        label: "Warehouse",
        value: locationForm.warehouse_id,
      },
      {
        key: "location_name",
        label: "Location name",
        value: locationForm.name,
      },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidLocationFields(missingFields.map((field) => field.key));
      return false;
    }
    setInvalidLocationFields([]);
    setError(null);
    return true;
  };

  const saveLocation = async () => {
    if (!validateLocationRequiredFields()) return;
    setSaving(true);
    try {
      if (selectedLocationId) {
        await apiFetch(`/locations/${selectedLocationId}`, {
          method: "PATCH",
          body: JSON.stringify(locationForm),
        });
      } else {
        await apiFetch("/locations", {
          method: "POST",
          body: JSON.stringify(locationForm),
        });
      }
      await loadAllData();
      setShowLocationModal(false);
      setSelectedLocationId(null);
      setLocationForm({
        warehouse_id: null,
        name: "",
        code: "",
        is_primary: false,
        is_scrap: false,
      });
      setInvalidLocationFields([]);
    } catch (err) {
      showDangerAlert(
        "Error saving location: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteLocation = async (locationId: number) => {
    const confirmed = await showConfirm({
      title: "Delete location",
      message: "Are you sure you want to delete this location?",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await apiFetch(`/locations/${locationId}`, { method: "DELETE" });
      await loadAllData();
    } catch (err) {
      showDangerAlert(
        "Error deleting location: " +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSaving(false);
    }
  };

  // ============= STOCK MOVE ACTIONS =============
  const resolveMoveWarehouseLocation = (
    productId: number,
    preferredWarehouseId: number | null = null,
    preferredLocationId: number | null = null,
  ) => {
    const locationById = new Map(locations.map((loc) => [loc.id, loc]));
    let warehouseId = preferredWarehouseId;
    let locationId = preferredLocationId;

    if (!warehouseId || !locationId) {
      const bestQuant = stockQuants
        .filter((q) => q.product_id === productId)
        .sort((a, b) => {
          const left = Number.isFinite(a.available_quantity)
            ? a.available_quantity
            : a.quantity;
          const right = Number.isFinite(b.available_quantity)
            ? b.available_quantity
            : b.quantity;
          return right - left;
        })[0];

      warehouseId = warehouseId ?? bestQuant?.warehouse_id ?? null;
      locationId = locationId ?? bestQuant?.location_id ?? null;
    }

    if (!warehouseId && locationId) {
      warehouseId = locationById.get(locationId)?.warehouse_id ?? null;
    }

    if (warehouseId && !locationId) {
      const defaultLocation =
        locations.find((l) => l.warehouse_id === warehouseId && l.is_primary) ??
        locations.find((l) => l.warehouse_id === warehouseId) ??
        null;
      locationId = defaultLocation?.id ?? null;
    }

    if (!warehouseId) {
      warehouseId = warehouses[0]?.id ?? null;
    }
    if (!locationId) {
      locationId =
        locations.find((l) => l.warehouse_id === warehouseId)?.id ??
        locations[0]?.id ??
        null;
    }
    if (!warehouseId && locationId) {
      warehouseId = locationById.get(locationId)?.warehouse_id ?? null;
    }

    return { warehouseId, locationId };
  };

  useEffect(() => {
    if (subView !== "form" || !moveForm.product_id) return;
    const { warehouseId, locationId } = resolveMoveWarehouseLocation(
      moveForm.product_id,
      moveForm.warehouse_id,
      moveForm.location_id,
    );
    if (
      warehouseId === moveForm.warehouse_id &&
      locationId === moveForm.location_id
    ) {
      return;
    }
    setMoveForm((prev) => ({
      ...prev,
      warehouse_id: warehouseId,
      location_id: locationId,
    }));
  }, [
    subView,
    moveForm.product_id,
    moveForm.warehouse_id,
    moveForm.location_id,
    warehouses,
    locations,
    stockQuants,
  ]);

  const openOnHandAdjustment = (
    product: ProductWithStock,
    preferredWarehouseId: number | null = null,
    preferredLocationId: number | null = null,
  ) => {
    const targetQuant = stockQuants.find((quant) => {
      if (quant.product_id !== product.id) return false;
      if (preferredLocationId && quant.location_id !== preferredLocationId) {
        return false;
      }
      if (preferredWarehouseId && quant.warehouse_id !== preferredWarehouseId) {
        return false;
      }
      return true;
    });

    if (targetQuant) {
      setMainView("operations");
      setOperationsTab("adjustments");
      setSubView("list");
      setShowOnlyChangedAdjustments(false);
      setSearchQuery(product.name);
      return;
    }

    const { warehouseId, locationId } = resolveMoveWarehouseLocation(
      product.id,
      preferredWarehouseId,
      preferredLocationId,
    );
    setMainView("operations");
    setOperationsTab("moves");
    setSelectedMoveId(null);
    setIsNew(true);
    setMoveForm({
      product_id: product.id,
      warehouse_id: warehouseId,
      location_id: locationId,
      move_type: "adjustment",
      quantity: 0,
      unit_cost: product.purchase_cost ?? 0,
      reference: "",
      source_document: "",
      notes: "",
    });
    setMoveLines([
      createMoveLine({
        product_id: product.id,
        quantity: 0,
        unit_cost: product.purchase_cost ?? 0,
      }),
    ]);
    setSubView("form");
    setInvalidMoveFields([]);
    setError(null);
  };

  const applyQuickStockAdjustment = async () => {
    if (!companyId || !selectedProductId) {
      showWarningAlert("Please select a company and product first.");
      return;
    }
    if (!quickStockWarehouseId || !quickStockLocationId) {
      showWarningAlert("Please select both warehouse and location.");
      return;
    }

    const selectedLocation = locations.find(
      (l) => l.id === quickStockLocationId,
    );
    if (
      !selectedLocation ||
      selectedLocation.warehouse_id !== quickStockWarehouseId
    ) {
      showWarningAlert("Selected location must belong to selected warehouse.");
      return;
    }

    const quantity = Number(quickStockQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      showWarningAlert("Quantity must be 0 or more.");
      return;
    }

    const unitCost = Number(productForm.purchase_cost);
    setQuickAdjustingStock(true);
    try {
      const move = await apiFetch<StockMove>("/stock/moves", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          product_id: selectedProductId,
          warehouse_id: quickStockWarehouseId,
          location_id: quickStockLocationId,
          move_type: "adjustment",
          quantity,
          unit_cost: Number.isFinite(unitCost) && unitCost > 0 ? unitCost : 0,
          reference: "",
          source_document: "",
          notes: "Quick adjustment from product form",
        }),
      });
      await apiFetch(`/stock/moves/${move.id}/confirm`, { method: "POST" });
      await loadAllData();
    } finally {
      setQuickAdjustingStock(false);
    }
  };

  const updateCountedQuantity = (quantId: number, value: string) => {
    setCountedByQuantId((previous) => ({ ...previous, [quantId]: value }));
  };

  const resetCountedAdjustments = () => {
    const reset: Record<number, string> = {};
    stockQuants.forEach((quant) => {
      const qty = Number.isFinite(quant.quantity) ? quant.quantity : 0;
      reset[quant.id] = String(qty);
    });
    setCountedByQuantId(reset);
    setShowOnlyChangedAdjustments(false);
  };

  const applyInventoryAdjustments = async (
    rowIds?: number[],
  ): Promise<void> => {
    if (!companyId) {
      setError("Please select a company first.");
      return;
    }

    const targetRows = adjustmentRows.filter((row) =>
      rowIds ? rowIds.includes(row.quantId) : row.changed,
    );

    const invalidRow = targetRows.find((row) => !row.isValid);
    if (invalidRow) {
      setError(
        `Counted quantity for ${invalidRow.productName} is invalid. Use a value of 0 or more.`,
      );
      return;
    }

    const rowsToApply = targetRows.filter((row) => row.changed);
    if (rowsToApply.length === 0) {
      setError("No counted differences to apply.");
      return;
    }

    setApplyingAdjustments(true);
    setError(null);
    try {
      for (const row of rowsToApply) {
        const created = await apiFetch<StockMove>("/stock/moves", {
          method: "POST",
          body: JSON.stringify({
            company_id: companyId,
            product_id: row.productId,
            warehouse_id: row.warehouseId,
            location_id: row.locationId,
            move_type: "adjustment",
            quantity: row.counted,
            unit_cost: row.unitCost,
            reference: "",
            source_document: "",
            notes: `Inventory adjustment (${row.onHand} -> ${row.counted})`,
          }),
        });
        await apiFetch(`/stock/moves/${created.id}/confirm`, {
          method: "POST",
        });
      }
      await loadAllData();
    } catch (err: any) {
      setError(err?.message || "Failed to apply inventory adjustments.");
    } finally {
      setApplyingAdjustments(false);
    }
  };

  const applyNewCountLine = async (line: NewStockCountLine) => {
    if (!companyId) {
      setError("Please select a company first.");
      return;
    }
    if (!line.product_id) {
      setError("Please select a product for the new line.");
      return;
    }
    const qty = parseFloat(line.quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Please enter a valid quantity (0 or more).");
      return;
    }
    const product = products.find((p) => p.id === line.product_id);
    setApplyingAdjustments(true);
    setError(null);
    try {
      const created = await apiFetch<StockMove>("/stock/moves", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          product_id: line.product_id,
          warehouse_id: line.warehouse_id,
          location_id: line.location_id,
          move_type: "adjustment",
          quantity: qty,
          unit_cost: product?.purchase_cost ?? 0,
          reference: "",
          source_document: "",
          notes: `Inventory adjustment (new count: ${qty})`,
        }),
      });
      await apiFetch(`/stock/moves/${created.id}/confirm`, { method: "POST" });
      removeNewCountLine(line.id);
      await loadAllData();
    } catch (err: any) {
      setError(err?.message || "Failed to apply new count line.");
    } finally {
      setApplyingAdjustments(false);
    }
  };

  const startNewMove = (moveType: string = "in") => {
    setSelectedMoveId(null);
    setIsNew(true);
    const defaultProduct = products[0];
    const defaultWarehouseId = warehouses[0]?.id ?? null;
    const defaultLocationId =
      locations.find((l) => l.warehouse_id === defaultWarehouseId)?.id ??
      locations[0]?.id ??
      null;
    setMoveForm({
      product_id: defaultProduct?.id ?? null,
      warehouse_id: defaultWarehouseId,
      location_id: defaultLocationId,
      move_type: moveType,
      quantity: 0,
      unit_cost: defaultProduct?.purchase_cost ?? 0,
      reference: "",
      source_document: "",
      notes: "",
    });
    setMoveLines([
      createMoveLine({
        product_id: defaultProduct?.id ?? null,
        quantity: 1,
        unit_cost: defaultProduct?.purchase_cost ?? 0,
      }),
    ]);
    setSubView("form");
    setInvalidMoveFields([]);
  };

  const openMove = (move: StockMove) => {
    const { warehouseId, locationId } = resolveMoveWarehouseLocation(
      move.product_id,
      move.warehouse_id,
      move.location_id,
    );
    setSelectedMoveId(move.id);
    setIsNew(false);
    setMoveForm({
      product_id: move.product_id,
      warehouse_id: warehouseId,
      location_id: locationId,
      move_type: move.move_type,
      quantity: move.quantity,
      unit_cost: move.unit_cost,
      reference: move.reference,
      source_document: move.source_document,
      notes: move.notes,
    });
    setMoveLines([
      createMoveLine({
        product_id: move.product_id,
        quantity: move.quantity,
        unit_cost: move.unit_cost,
      }),
    ]);
    setSubView("form");
    setInvalidMoveFields([]);
  };

  const addMoveLine = () => {
    const defaultProduct = products[0];
    setMoveLines((previous) => [
      ...previous,
      createMoveLine({
        product_id: defaultProduct?.id ?? null,
        quantity: 1,
        unit_cost: defaultProduct?.purchase_cost ?? 0,
      }),
    ]);
  };

  const removeMoveLine = (lineId: string) => {
    setMoveLines((previous) => {
      if (previous.length <= 1) return previous;
      return previous.filter((line) => line.line_id !== lineId);
    });
  };

  const updateMoveLine = (
    lineId: string,
    patch: Partial<
      Pick<StockMoveLineInput, "product_id" | "quantity" | "unit_cost">
    >,
  ) => {
    setMoveLines((previous) =>
      previous.map((line) =>
        line.line_id === lineId ? { ...line, ...patch } : line,
      ),
    );
  };

  const clearInvalidMoveField = (key: string, value: unknown) => {
    if (!invalidMoveFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidMoveFields((prev) => prev.filter((field) => field !== key));
  };

  const validateMoveRequiredFields = (): boolean => {
    const requiredFields = [
      { key: "warehouse", label: "Warehouse", value: moveForm.warehouse_id },
      { key: "location", label: "Location", value: moveForm.location_id },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidMoveFields(missingFields.map((field) => field.key));
      return false;
    }
    const selectedLocation = locations.find(
      (l) => l.id === moveForm.location_id,
    );
    if (
      moveForm.warehouse_id &&
      selectedLocation &&
      selectedLocation.warehouse_id !== moveForm.warehouse_id
    ) {
      setError("Selected location must belong to the selected warehouse.");
      setInvalidMoveFields(["warehouse", "location"]);
      return false;
    }
    setInvalidMoveFields([]);
    setError(null);
    return true;
  };

  const getNormalizedMoveLines = () =>
    moveLines.map((line, index) => {
      const productId = line.product_id;
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unit_cost);
      return {
        index,
        productId,
        quantity,
        unitCost,
        validProduct: productId !== null,
        validQuantity: Number.isFinite(quantity) && quantity > 0,
        validUnitCost: Number.isFinite(unitCost) && unitCost >= 0,
      };
    });

  const validateMoveLines = (): boolean => {
    const normalized = getNormalizedMoveLines();
    if (!normalized.length) {
      setError("Add at least one product line.");
      return false;
    }

    const missingProduct = normalized.find((line) => !line.validProduct);
    if (missingProduct) {
      setError(`Product is required on line ${missingProduct.index + 1}.`);
      return false;
    }

    const invalidQuantity = normalized.find((line) => !line.validQuantity);
    if (invalidQuantity) {
      setError(
        `Quantity must be greater than 0 on line ${invalidQuantity.index + 1}.`,
      );
      return false;
    }

    const invalidCost = normalized.find((line) => !line.validUnitCost);
    if (invalidCost) {
      setError(`Unit cost must be 0 or more on line ${invalidCost.index + 1}.`);
      return false;
    }
    return true;
  };

  const saveMove = async () => {
    if (!companyId) {
      showWarningAlert("Please select a company first.");
      return;
    }
    if (!validateMoveRequiredFields()) return;
    if (!validateMoveLines()) return;

    const normalizedLines = getNormalizedMoveLines();
    const firstLine = normalizedLines[0];
    if (!firstLine?.productId) return;
    const sharedReference =
      moveForm.reference.trim() ||
      (normalizedLines.length > 1
        ? `WH/${(moveForm.move_type || "mov").toUpperCase()}/${Date.now()}`
        : "");

    setSaving(true);
    try {
      if (selectedMoveId && !isNew) {
        if (normalizedLines.length > 1) {
          setError(
            "Editing an existing move supports one product line. Create a new move for multiple lines.",
          );
          return;
        }
        const payload = {
          ...moveForm,
          company_id: companyId,
          product_id: firstLine.productId,
          quantity: firstLine.quantity,
          unit_cost: firstLine.unitCost,
        };
        await apiFetch(`/stock/moves/${selectedMoveId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        for (const line of normalizedLines) {
          if (!line.productId) continue;
          const payload = {
            ...moveForm,
            company_id: companyId,
            product_id: line.productId,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            reference: sharedReference,
          };
          await apiFetch("/stock/moves", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }
      await loadAllData();
      setSubView("list");
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  const confirmMove = async (moveId: number) => {
    if (!companyId) return;
    await apiFetch(`/stock/moves/${moveId}/confirm`, { method: "POST" });
    await loadAllData();
  };

  const cancelMove = async (moveId: number) => {
    if (!companyId) return;
    await apiFetch(`/stock/moves/${moveId}/cancel`, { method: "POST" });
    await loadAllData();
  };

  const deleteMove = async (moveId: number) => {
    if (!companyId) return;
    await apiFetch(`/stock/moves/${moveId}`, { method: "DELETE" });
    await loadAllData();
    setSubView("list");
    setIsNew(false);
  };

  const escapeMovePdfValue = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const printMovePdf = async (sourceMove?: StockMove) => {
    const sourceGroup =
      sourceMove && sourceMove.reference
        ? stockMoves.filter(
            (m) =>
              m.reference === sourceMove.reference &&
              m.move_type === sourceMove.move_type &&
              m.warehouse_id === sourceMove.warehouse_id &&
              m.location_id === sourceMove.location_id,
          )
        : sourceMove
          ? [sourceMove]
          : [];
    const lines = sourceMove
      ? sourceGroup.map((move) => ({
          product_id: move.product_id,
          quantity: move.quantity,
          unit_cost: move.unit_cost,
        }))
      : moveLines;
    const normalizedLines = lines
      .filter((line) => line.product_id && Number(line.quantity) > 0)
      .map((line) => {
        const product = products.find((p) => p.id === line.product_id);
        const quantity = Number(line.quantity) || 0;
        const unitCost = Number(line.unit_cost) || 0;
        return {
          productName: product?.name || "Unknown Product",
          uom: product?.uom || "Units",
          quantity,
          unitCost,
          total: quantity * unitCost,
        };
      });
    if (!normalizedLines.length) {
      setError("Add at least one valid product line before printing.");
      return;
    }

    const company = selectedCompany;
    const warehouseId = sourceMove?.warehouse_id ?? moveForm.warehouse_id;
    const locationId = sourceMove?.location_id ?? moveForm.location_id;
    const warehouseName =
      warehouses.find((w) => w.id === warehouseId)?.name || "-";
    const locationName =
      locations.find((l) => l.id === locationId)?.name || "-";
    const moveType = sourceMove?.move_type ?? moveForm.move_type;
    const moveTypeLabel =
      MOVE_TYPES.find((entry) => entry.value === moveType)?.label || moveType;
    const moveState = sourceMove?.state ?? "draft";
    const moveStateLabel =
      STATES.find((entry) => entry.value === moveState)?.label || moveState;
    const printedAt = new Date();
    const scheduledDateLabel = sourceMove?.scheduled_date
      ? new Date(sourceMove.scheduled_date).toLocaleDateString()
      : printedAt.toLocaleDateString();
    const effectiveDateLabel = sourceMove?.done_date
      ? new Date(sourceMove.done_date).toLocaleDateString()
      : printedAt.toLocaleDateString();
    const referenceRaw =
      sourceMove?.reference || moveForm.reference || `WH/MOV/${Date.now()}`;
    const reference = referenceRaw.trim();
    const sourceDocument =
      sourceMove?.source_document || moveForm.source_document;
    const notes = sourceMove?.notes || moveForm.notes;
    const footerHtml = (companySettings?.document_footer || "").replace(
      /\n/g,
      "<br />",
    );
    const headerHtml = (companySettings?.document_header || "").replace(
      /\n/g,
      "<br />",
    );
    const logoMarkup = companySettings?.logo_data
      ? `<img class="logo" src="${companySettings.logo_data}" alt="Company logo" />`
      : `<div class="logo-fallback">${escapeMovePdfValue(
          (company?.name || "CO")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || "")
            .join("") || "CO",
        )}</div>`;
    const formatAddressLines = (
      address?: string,
      city?: string,
      country?: string,
    ) => {
      const parts = (address || "")
        .split(/\r?\n|,/)
        .map((part) => part.trim())
        .filter(Boolean);
      const street1 = parts[0] || "";
      const street2 = parts[1] || "";
      return {
        line1: [street1, street2].filter(Boolean).join(", "),
        line2: (city || "").trim(),
        line3: (country || "").trim(),
      };
    };
    const companyAddress = formatAddressLines(
      company?.address,
      company?.city,
      company?.country,
    );
    const totalQuantity = normalizedLines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    );
    const totalAmount = normalizedLines.reduce(
      (sum, line) => sum + line.total,
      0,
    );
    const signatureTitle =
      moveType === "out"
        ? "Delivered By"
        : moveType === "in"
          ? "Received By"
          : moveType === "internal"
            ? "Handled By"
            : "Approved By";
    const linesHtml = normalizedLines
      .map(
        (line, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeMovePdfValue(line.productName)}</td>
            <td style="text-align:right">${line.quantity.toFixed(2)}</td>
            <td>${escapeMovePdfValue(line.uom)}</td>
            <td style="text-align:right">$${line.unitCost.toFixed(2)}</td>
            <td style="text-align:right">$${line.total.toFixed(2)}</td>
          </tr>
        `,
      )
      .join("");

    const html = `
      <html>
        <head>
          <title>${escapeMovePdfValue(reference)}</title>
          <style>
            :root {
              --ink: #0f172a;
              --muted: #64748b;
              --line: #dbe3f0;
              --soft: #f8fafc;
              --panel: #ffffff;
              --accent: #1d4ed8;
              --accent-soft: #eff6ff;
              --accent-deep: #1e3a8a;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 0;
              background: #eef2f7;
              color: var(--ink);
              font-family: "Segoe UI", Arial, sans-serif;
            }
            .doc {
              width: 100%;
              padding: 28px 32px 36px;
              background: var(--panel);
              position: relative;
            }
            .watermark {
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 64px;
              font-weight: 800;
              letter-spacing: 0.06em;
              color: #94a3b8;
              opacity: ${companySettings?.document_watermark_opacity || "0.06"};
              pointer-events: none;
              transform: rotate(-24deg);
            }
            .topbar {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 20px;
              padding-bottom: 18px;
              border-bottom: 2px solid var(--line);
            }
            .brand {
              display: flex;
              align-items: flex-start;
              gap: 16px;
              min-width: 0;
            }
            .logo-wrap {
              width: 120px;
              min-height: 72px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              margin: 0 auto;
            }
            .logo {
              display: block;
              max-width: 120px;
              max-height: 72px;
              width: auto;
              height: auto;
              object-fit: contain;
              margin: 0 auto;
            }
            .logo-fallback {
              width: 72px;
              height: 72px;
              border-radius: 16px;
              background: linear-gradient(135deg, var(--accent), var(--accent-deep));
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: 0.05em;
              margin: 0 auto;
            }
            .company-block { min-width: 0; }
            .company-name {
              font-size: 24px;
              font-weight: 800;
              line-height: 1.1;
              margin-bottom: 6px;
            }
            .company-meta {
              font-size: 12px;
              line-height: 1.6;
              color: var(--muted);
            }
            .doc-side {
              text-align: right;
              min-width: 220px;
            }
            .doc-kicker {
              display: inline-block;
              margin-bottom: 10px;
              padding: 6px 10px;
              border-radius: 999px;
              background: var(--accent-soft);
              color: var(--accent-deep);
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .doc-title {
              margin: 0;
              font-size: 28px;
              font-weight: 800;
            }
            .doc-printed {
              margin-top: 8px;
              font-size: 12px;
              color: var(--muted);
            }
            .header-note {
              margin-top: 14px;
              padding: 10px 14px;
              border: 1px solid var(--line);
              border-radius: 12px;
              background: var(--soft);
              font-size: 12px;
              line-height: 1.6;
              color: var(--muted);
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1.1fr 0.9fr;
              gap: 18px;
              margin-top: 18px;
            }
            .meta-card {
              border: 1px solid var(--line);
              border-radius: 14px;
              background: var(--panel);
              overflow: hidden;
            }
            .meta-head {
              padding: 10px 14px;
              background: var(--accent-soft);
              color: var(--accent-deep);
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .meta-body {
              padding: 14px;
              display: grid;
              gap: 10px;
              font-size: 13px;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              gap: 18px;
              border-bottom: 1px dashed #e2e8f0;
              padding-bottom: 8px;
            }
            .meta-row:last-child {
              border-bottom: none;
              padding-bottom: 0;
            }
            .meta-label {
              color: var(--muted);
              font-weight: 600;
            }
            .meta-value {
              color: var(--ink);
              font-weight: 700;
              text-align: right;
            }
            .doc-table-wrap {
              margin-top: 20px;
              border: 1px solid var(--line);
              border-radius: 14px;
              overflow: hidden;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            thead th {
              padding: 11px 12px;
              background: linear-gradient(180deg, #1e40af, #1d4ed8);
              color: #ffffff;
              text-align: left;
              font-weight: 800;
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
            tbody td {
              padding: 11px 12px;
              border-bottom: 1px solid #e2e8f0;
              vertical-align: top;
            }
            tbody tr:nth-child(even) td {
              background: #f8fbff;
            }
            tfoot td {
              padding: 12px;
              background: #eff6ff;
              border-top: 2px solid var(--line);
              font-weight: 800;
            }
            .amount {
              text-align: right;
              white-space: nowrap;
            }
            .summary {
              margin-top: 16px;
              display: flex;
              justify-content: flex-end;
            }
            .footer {
              margin-top: 20px;
              padding-top: 12px;
              border-top: 1px solid var(--line);
              text-align: center;
              font-size: 11px;
              line-height: 1.6;
              color: var(--muted);
            }
            .signatures {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 24px;
              margin-top: 26px;
            }
            .signature-card {
              border: 1px solid var(--line);
              border-radius: 14px;
              padding: 18px 20px 16px;
              min-height: 156px;
              background: linear-gradient(180deg, #ffffff, #fbfdff);
            }
            .signature-title {
              margin: 0 0 30px;
              color: var(--accent-deep);
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .signature-line {
              margin: 28px auto 0;
              border-bottom: 1px solid #94a3b8;
              height: 26px;
              width: 100%;
            }
            .signature-meta {
              display: grid;
              grid-template-columns: 1fr 150px;
              gap: 18px;
              margin-top: 16px;
            }
            .signature-label {
              font-size: 11px;
              color: var(--muted);
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .signature-value {
              margin-top: 10px;
              min-height: 18px;
              font-size: 12px;
              color: var(--ink);
              font-weight: 600;
            }
            .signature-fill-line {
              margin-top: 12px;
              border-bottom: 1px solid #94a3b8;
              height: 24px;
              width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="doc">
            ${companySettings?.document_watermark ? `<div class="watermark">${escapeMovePdfValue(companySettings.document_watermark)}</div>` : ""}
            <div class="topbar">
              <div class="brand">
                <div class="logo-wrap">${logoMarkup}</div>
                <div class="company-block">
                  <div class="company-name">${escapeMovePdfValue(company?.name || "Your Company")}</div>
                  <div class="company-meta">
                    ${companyAddress.line1 ? `${escapeMovePdfValue(companyAddress.line1)}<br />` : ""}
                    ${companyAddress.line2 ? `${escapeMovePdfValue(companyAddress.line2)}<br />` : ""}
                    ${companyAddress.line3 ? `${escapeMovePdfValue(companyAddress.line3)}<br />` : ""}
                    ${company?.email ? `Email: ${escapeMovePdfValue(company.email)}<br />` : ""}
                    ${company?.phone ? `Phone: ${escapeMovePdfValue(company.phone)}` : ""}
                  </div>
                </div>
              </div>
              <div class="doc-side">
                <div class="doc-kicker">Inventory Document</div>
                <h1 class="doc-title">${escapeMovePdfValue(moveTypeLabel)}</h1>
                <div class="doc-printed">Printed: ${escapeMovePdfValue(printedAt.toLocaleString())}</div>
              </div>
            </div>
            ${headerHtml ? `<div class="header-note">${headerHtml}</div>` : ""}
            <div class="meta-grid">
              <div class="meta-card">
                <div class="meta-head">Document Details</div>
                <div class="meta-body">
                  <div class="meta-row">
                    <span class="meta-label">Reference</span>
                    <span class="meta-value">${escapeMovePdfValue(reference)}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Operation Type</span>
                    <span class="meta-value">${escapeMovePdfValue(moveTypeLabel)}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Status</span>
                    <span class="meta-value">${escapeMovePdfValue(moveStateLabel)}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Document Date</span>
                    <span class="meta-value">${escapeMovePdfValue(scheduledDateLabel)}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Source Document</span>
                    <span class="meta-value">${escapeMovePdfValue(sourceDocument || "-")}</span>
                  </div>
                </div>
              </div>
              <div class="meta-card">
                <div class="meta-head">Warehouse</div>
                <div class="meta-body">
                  <div class="meta-row">
                    <span class="meta-label">Warehouse</span>
                    <span class="meta-value">${escapeMovePdfValue(warehouseName)}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Location</span>
                    <span class="meta-value">${escapeMovePdfValue(locationName)}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Notes</span>
                    <span class="meta-value">${escapeMovePdfValue(notes || "-")}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Effective Date</span>
                    <span class="meta-value">${escapeMovePdfValue(effectiveDateLabel)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="doc-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="width:56px;">#</th>
                    <th>Product</th>
                    <th class="amount" style="width:120px;">Quantity</th>
                    <th style="width:96px;">UoM</th>
                    <th class="amount" style="width:130px;">Unit Cost</th>
                    <th class="amount" style="width:140px;">Total</th>
                  </tr>
                </thead>
                <tbody>${linesHtml}</tbody>
                <tfoot>
                  <tr>
                    <td colspan="2">Totals</td>
                    <td class="amount">${totalQuantity.toFixed(2)}</td>
                    <td></td>
                    <td></td>
                    <td class="amount">$${totalAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="signatures">
              <div class="signature-card">
                <h3 class="signature-title">${escapeMovePdfValue(signatureTitle)}</h3>
                <div class="signature-line"></div>
                <div class="signature-meta">
                  <div>
                    <div class="signature-label">Name / Signature</div>
                    <div class="signature-fill-line"></div>
                  </div>
                  <div>
                    <div class="signature-label">Date</div>
                    <div class="signature-fill-line"></div>
                  </div>
                </div>
              </div>
              <div class="signature-card">
                <h3 class="signature-title">Authorized By</h3>
                <div class="signature-line"></div>
                <div class="signature-meta">
                  <div>
                    <div class="signature-label">Name / Signature</div>
                    <div class="signature-fill-line"></div>
                  </div>
                  <div>
                    <div class="signature-label">Date</div>
                    <div class="signature-fill-line"></div>
                  </div>
                </div>
              </div>
            </div>
            ${footerHtml ? `<div class="footer">${footerHtml}</div>` : ""}
          </div>
        </body>
      </html>
    `;

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    try {
      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `${reference.replace(/[^\w-]+/g, "_")}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(container)
        .save();
    } finally {
      document.body.removeChild(container);
    }
  };

  // ============= CATEGORY ACTIONS =============
  const openCategoryModal = (category?: Category) => {
    if (category) {
      setSelectedCategoryId(category.id);
      setCategoryForm({ name: category.name });
    } else {
      setSelectedCategoryId(null);
      setCategoryForm({ name: "" });
    }
    setInvalidCategoryFields([]);
    setShowCategoryModal(true);
  };

  const clearInvalidCategoryField = (key: string, value: unknown) => {
    if (!invalidCategoryFields.includes(key)) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    setInvalidCategoryFields((prev) => prev.filter((field) => field !== key));
  };

  const validateCategoryRequiredFields = (): boolean => {
    const requiredFields = [
      {
        key: "category_name",
        label: "Category name",
        value: categoryForm.name,
      },
    ];
    const missingFields = getMissingRequiredFields(requiredFields);
    if (missingFields.length) {
      const message = getRequiredFieldError(requiredFields);
      if (message) {
        setError(message);
      }
      setInvalidCategoryFields(missingFields.map((field) => field.key));
      return false;
    }
    setInvalidCategoryFields([]);
    setError(null);
    return true;
  };

  const saveCategory = async () => {
    if (!companyId) {
      showWarningAlert("Please select a company first.");
      return;
    }
    if (!validateCategoryRequiredFields()) return;
    setSaving(true);
    try {
      if (selectedCategoryId) {
        await apiFetch(`/categories/${selectedCategoryId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: categoryForm.name }),
        });
      } else {
        await apiFetch("/categories", {
          method: "POST",
          body: JSON.stringify({ ...categoryForm, company_id: companyId }),
        });
      }
      await loadAllData();
      setShowCategoryModal(false);
      setSelectedCategoryId(null);
      setCategoryForm({ name: "" });
      setInvalidCategoryFields([]);
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (categoryId: number) => {
    const confirmed = await showConfirm({
      title: "Delete category",
      message: "Are you sure you want to delete this category?",
      variant: "warning",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await apiFetch(`/categories/${categoryId}`, { method: "DELETE" });
      await loadAllData();
    } finally {
      setSaving(false);
    }
  };

  // ============= NAVIGATION =============
  const goBack = () => {
    setSubView("list");
    setSelectedProductId(null);
    setSelectedWarehouseId(null);
    setSelectedMoveId(null);
    setMoveLines([]);
    setIsNew(false);
  };

  // ============= COMPUTED =============
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedWarehouse = warehouses.find(
    (w) => w.id === selectedWarehouseId,
  );

  const warehouseIdByLocationId = useMemo(
    () =>
      new Map(
        locations.map((location) => [location.id, location.warehouse_id]),
      ),
    [locations],
  );

  const productIdsByWarehouse = useMemo(() => {
    const grouped = new Map<number, Set<number>>();
    stockQuants.forEach((quant) => {
      const warehouseId =
        quant.warehouse_id ??
        (quant.location_id
          ? (warehouseIdByLocationId.get(quant.location_id) ?? null)
          : null);
      const quantity = Number.isFinite(quant.quantity) ? quant.quantity : 0;
      if (!warehouseId || quantity <= 0) return;
      if (!grouped.has(warehouseId)) {
        grouped.set(warehouseId, new Set<number>());
      }
      grouped.get(warehouseId)?.add(quant.product_id);
    });
    return grouped;
  }, [stockQuants, warehouseIdByLocationId]);

  const productIdsByLocation = useMemo(() => {
    const grouped = new Map<number, Set<number>>();
    stockQuants.forEach((quant) => {
      if (!quant.location_id) return;
      const quantity = Number.isFinite(quant.quantity) ? quant.quantity : 0;
      if (quantity <= 0) return;
      if (!grouped.has(quant.location_id)) {
        grouped.set(quant.location_id, new Set<number>());
      }
      grouped.get(quant.location_id)?.add(quant.product_id);
    });
    return grouped;
  }, [stockQuants]);
  const selectedMove = stockMoves.find((m) => m.id === selectedMoveId);
  const isMoveReadonly =
    selectedMove?.state === "done" || selectedMove?.state === "cancelled";
  const selectedProductStock = useMemo(() => {
    if (!selectedProductId) {
      return { onHand: 0, available: 0, reserved: 0 };
    }
    const toFinite = (value: unknown) => {
      const num = typeof value === "number" ? value : Number(value);
      return Number.isFinite(num) ? num : 0;
    };
    const quantTotals = stockQuants
      .filter((q) => q.product_id === selectedProductId)
      .reduce(
        (acc, quant) => ({
          onHand: acc.onHand + toFinite(quant.quantity),
          available: acc.available + toFinite(quant.available_quantity),
          reserved: acc.reserved + toFinite(quant.reserved_quantity),
        }),
        { onHand: 0, available: 0, reserved: 0 },
      );

    return {
      onHand: toFinite(selectedProduct?.quantity_on_hand) || quantTotals.onHand,
      available:
        toFinite(selectedProduct?.quantity_available) || quantTotals.available,
      reserved:
        toFinite(selectedProduct?.quantity_reserved) || quantTotals.reserved,
    };
  }, [selectedProductId, selectedProduct, stockQuants]);
  const selectedProductWarehouseRows = useMemo(() => {
    if (!selectedProductId) return [];
    const locationById = new Map(locations.map((l) => [l.id, l]));
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

    return stockQuants
      .filter((q) => q.product_id === selectedProductId)
      .map((q) => {
        const location = q.location_id ? locationById.get(q.location_id) : null;
        const warehouse = q.warehouse_id
          ? warehouseById.get(q.warehouse_id)
          : location?.warehouse_id
            ? warehouseById.get(location.warehouse_id)
            : null;
        return {
          quantId: q.id,
          warehouseId: warehouse?.id ?? q.warehouse_id ?? null,
          warehouseName: warehouse?.name || "-",
          locationId: location?.id ?? q.location_id ?? null,
          locationName: location?.name || "-",
          onHand: Number.isFinite(q.quantity) ? q.quantity : 0,
          available: Number.isFinite(q.available_quantity)
            ? q.available_quantity
            : 0,
          reserved: Number.isFinite(q.reserved_quantity)
            ? q.reserved_quantity
            : 0,
        };
      })
      .filter((row) => row.onHand > 0)
      .sort((a, b) => {
        if (b.available !== a.available) return b.available - a.available;
        return a.warehouseName.localeCompare(b.warehouseName);
      });
  }, [selectedProductId, stockQuants, locations, warehouses]);

  const filteredProducts = products.filter((p) => {
    if (filterCategoryId !== null && p.category_id !== filterCategoryId)
      return false;
    if (filterLocationId !== null) {
      const hasStockInLocation =
        productIdsByLocation.get(filterLocationId)?.has(p.id) ?? false;
      if (!hasStockInLocation) return false;
    }
    if (filterWarehouseId !== null) {
      const hasStockInWarehouse =
        productIdsByWarehouse.get(filterWarehouseId)?.has(p.id) ?? false;
      if (!hasStockInWarehouse) return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    );
  });
  const productTotalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / productsPageSize),
  );
  const productFromItem =
    filteredProducts.length === 0
      ? 0
      : (productsPage - 1) * productsPageSize + 1;
  const productToItem = Math.min(
    filteredProducts.length,
    productsPage * productsPageSize,
  );
  const pagedProducts = useMemo(() => {
    const start = (productsPage - 1) * productsPageSize;
    return filteredProducts.slice(start, start + productsPageSize);
  }, [filteredProducts, productsPage, productsPageSize]);
  const allFilteredProductsSelected =
    pagedProducts.length > 0 &&
    pagedProducts.every((product) => selectedProductIds.has(product.id));
  const selectedProducts = filteredProducts.filter((product) =>
    selectedProductIds.has(product.id),
  );

  const toggleSelectProduct = (productId: number) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleSelectAllProducts = () => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allFilteredProductsSelected) {
        pagedProducts.forEach((product) => next.delete(product.id));
      } else {
        pagedProducts.forEach((product) => next.add(product.id));
      }
      return next;
    });
  };

  const exportSelectedProducts = () => {
    if (!selectedProducts.length) return;
    setExportingSelectedProducts(true);
    try {
      const rows = selectedProducts.map((product) => {
        const category = categories.find((c) => c.id === product.category_id);
        return {
          Product: product.name,
          Reference: product.reference || "",
          Location: productLocationById.get(product.id) || "",
          Category: category?.name || "",
          Type:
            PRODUCT_TYPES.find((type) => type.value === product.product_type)
              ?.label || product.product_type,
          "On Hand": `${Number.isFinite(product.quantity_on_hand) ? product.quantity_on_hand : 0} ${product.uom}`,
          Available: `${product.quantity_available} ${product.uom}`,
          "Sale Price": product.sale_price.toFixed(2),
          "Sale Cost": product.sales_cost.toFixed(2),
          Cost: product.purchase_cost.toFixed(2),
          "Stock Value": product.stock_value.toFixed(2),
        };
      });
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
      XLSX.writeFile(workbook, "products-selected.xlsx");
    } finally {
      setExportingSelectedProducts(false);
    }
  };

  useEffect(() => {
    setProductsPage((prev) => Math.min(prev, productTotalPages));
  }, [productTotalPages]);

  useEffect(() => {
    setProductsPage(1);
  }, [
    mainView,
    subView,
    searchQuery,
    filterCategoryId,
    filterLocationId,
    filterWarehouseId,
    productsPageSize,
  ]);

  const activeProductWarehouse = warehouses.find(
    (warehouse) => warehouse.id === filterWarehouseId,
  );
  const activeProductLocation = locations.find(
    (location) => location.id === filterLocationId,
  );

  const productLocationById = useMemo(() => {
    const locationById = new Map(locations.map((l) => [l.id, l]));
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const grouped = new Map<
      number,
      Array<{
        warehouse_id: number | null;
        location_id: number | null;
        qty: number;
      }>
    >();

    for (const quant of stockQuants) {
      const qty = Number.isFinite(quant.available_quantity)
        ? quant.available_quantity
        : quant.quantity;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const existing = grouped.get(quant.product_id) ?? [];
      const same = existing.find(
        (entry) =>
          entry.location_id === quant.location_id &&
          entry.warehouse_id === quant.warehouse_id,
      );
      if (same) {
        same.qty += qty;
      } else {
        existing.push({
          warehouse_id: quant.warehouse_id,
          location_id: quant.location_id,
          qty,
        });
      }
      grouped.set(quant.product_id, existing);
    }

    const labels = new Map<number, string>();
    for (const product of products) {
      const buckets = grouped.get(product.id) ?? [];
      if (!buckets.length) {
        labels.set(product.id, product.location || "-");
        continue;
      }

      buckets.sort((a, b) => b.qty - a.qty);
      const primary = buckets[0];
      const location = primary.location_id
        ? locationById.get(primary.location_id)
        : null;
      const warehouse = primary.warehouse_id
        ? warehouseById.get(primary.warehouse_id)
        : location?.warehouse_id
          ? warehouseById.get(location.warehouse_id)
          : null;

      const base = [warehouse?.name, location?.name]
        .filter(Boolean)
        .join(" / ");
      const primaryLabel =
        base || location?.name || warehouse?.name || product.location || "-";
      const extraCount = buckets.length - 1;
      labels.set(
        product.id,
        extraCount > 0 ? `${primaryLabel} (+${extraCount} more)` : primaryLabel,
      );
    }

    return labels;
  }, [locations, warehouses, stockQuants, products]);

  const filteredMoves = useMemo(() => {
    return [...stockMoves]
      .filter((m) => {
        if (filterState !== "all" && m.state !== filterState) return false;
        if (filterMoveType !== "all" && m.move_type !== filterMoveType)
          return false;
        if (filterCurrency) {
          const moveCurrency = normalizeCurrencyCode(m.currency);
          if (!moveCurrency || moveCurrency !== filterCurrency) return false;
        }
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const product = products.find((p) => p.id === m.product_id);
        return (
          m.reference?.toLowerCase().includes(q) ||
          product?.name.toLowerCase().includes(q) ||
          getMoveTypeLabel(m).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const timeDiff = getStockMoveSortValue(b) - getStockMoveSortValue(a);
        if (timeDiff !== 0) return timeDiff;
        return b.id - a.id;
      });
  }, [
    stockMoves,
    filterState,
    filterMoveType,
    filterCurrency,
    searchQuery,
    products,
  ]);

  const operationsCurrencyOptions = operationCurrencies.length
    ? operationCurrencies
    : ["USD"];

  const moveLinesTotals = useMemo(() => {
    return moveLines.reduce(
      (acc, line) => {
        const quantity = Number(line.quantity);
        const unitCost = Number(line.unit_cost);
        if (Number.isFinite(quantity)) {
          acc.quantity += quantity;
        }
        if (Number.isFinite(quantity) && Number.isFinite(unitCost)) {
          acc.total += quantity * unitCost;
        }
        return acc;
      },
      { quantity: 0, total: 0 },
    );
  }, [moveLines]);

  const adjustmentRows = useMemo(() => {
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    const locationById = new Map(locations.map((l) => [l.id, l]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const query = searchQuery.trim().toLowerCase();

    return stockQuants
      .map((quant) => {
        const product = productById.get(quant.product_id);
        const location = quant.location_id
          ? locationById.get(quant.location_id)
          : null;
        const warehouse = quant.warehouse_id
          ? warehouseById.get(quant.warehouse_id)
          : location?.warehouse_id
            ? warehouseById.get(location.warehouse_id)
            : null;

        const onHand = Number.isFinite(quant.quantity) ? quant.quantity : 0;
        const countedText = countedByQuantId[quant.id] ?? String(onHand);
        const counted = Number(countedText);
        const isValid = Number.isFinite(counted) && counted >= 0;
        const difference = isValid ? counted - onHand : 0;
        const changed = isValid && Math.abs(difference) > 0.0001;
        const unitCost =
          Number.isFinite(quant.unit_cost) && quant.unit_cost > 0
            ? quant.unit_cost
            : Number.isFinite(product?.purchase_cost)
              ? (product?.purchase_cost ?? 0)
              : 0;

        return {
          quantId: quant.id,
          productId: quant.product_id,
          productName: product?.name || "-",
          warehouseId: quant.warehouse_id ?? warehouse?.id ?? null,
          warehouseName: warehouse?.name || "-",
          locationId: quant.location_id ?? location?.id ?? null,
          locationName: location?.name || "-",
          uom: product?.uom || "Units",
          onHand,
          countedText,
          counted,
          difference,
          changed,
          isValid,
          unitCost,
        };
      })
      .filter((row) => {
        if (row.onHand === 0 && !row.changed) return false;
        if (showOnlyChangedAdjustments && !row.changed) return false;
        if (!query) return true;
        return (
          row.productName.toLowerCase().includes(query) ||
          row.warehouseName.toLowerCase().includes(query) ||
          row.locationName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (a.changed !== b.changed) return a.changed ? -1 : 1;
        return a.productName.localeCompare(b.productName);
      });
  }, [
    stockQuants,
    warehouses,
    locations,
    products,
    countedByQuantId,
    searchQuery,
    showOnlyChangedAdjustments,
  ]);

  const productMonetaryTotals = useMemo(() => {
    return filteredProducts.reduce(
      (acc, p) => {
        acc.salePrice += Number.isFinite(p.sale_price) ? p.sale_price : 0;
        acc.salesCost += Number.isFinite(p.sales_cost) ? p.sales_cost : 0;
        acc.purchaseCost += Number.isFinite(p.purchase_cost)
          ? p.purchase_cost
          : 0;
        acc.stockValue += Number.isFinite(p.stock_value) ? p.stock_value : 0;
        return acc;
      },
      { salePrice: 0, salesCost: 0, purchaseCost: 0, stockValue: 0 },
    );
  }, [filteredProducts]);

  const categoryProductCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of products) {
      if (p.category_id === null) continue;
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const uncategorizedProducts = useMemo(
    () => products.filter((product) => product.category_id === null),
    [products],
  );

  const categoryRows = useMemo<CategoryListRow[]>(() => {
    const rows: CategoryListRow[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      isDefault: false,
      products: products.filter(
        (product) => product.category_id === category.id,
      ),
      category,
    }));

    rows.unshift({
      id: 0,
      name: "All",
      isDefault: true,
      products: uncategorizedProducts,
      category: null,
    });

    return rows;
  }, [categories, products, uncategorizedProducts]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categoryRows;
    const q = searchQuery.toLowerCase();
    return categoryRows.filter(
      (category) =>
        category.name.toLowerCase().includes(q) ||
        category.products.some((product) =>
          product.name.toLowerCase().includes(q),
        ),
    );
  }, [categoryRows, searchQuery]);

  const categoryPageSize = 20;

  const toggleCategoryGroup = (categoryKey: string) => {
    setExpandedCategoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) next.delete(categoryKey);
      else next.add(categoryKey);
      return next;
    });
    setCategoryPages((prev) => ({
      ...prev,
      [categoryKey]: prev[categoryKey] ?? 1,
    }));
  };

  const changeCategoryPage = (categoryKey: string, page: number) => {
    setCategoryPages((prev) => ({
      ...prev,
      [categoryKey]: page,
    }));
  };

  const groupedStockOnHandRows = useMemo(() => {
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const warehouseById = new Map(
      warehouses.map((warehouse) => [warehouse.id, warehouse]),
    );
    const locationById = new Map(
      locations.map((location) => [location.id, location]),
    );
    const query = searchQuery.trim().toLowerCase();
    const groups = new Map<
      string,
      {
        key: string;
        warehouseId: number | null;
        locationId: number | null;
        locationLabel: string;
        rowCount: number;
        onHand: number;
        reserved: number;
        rows: Array<{
          quant: StockQuant;
          product: ProductWithStock | null;
          warehouse: Warehouse | null;
          location: Location | null;
        }>;
      }
    >();

    stockQuants.forEach((quant) => {
      const product = productById.get(quant.product_id) ?? null;
      const location = quant.location_id
        ? (locationById.get(quant.location_id) ?? null)
        : null;
      const warehouse = quant.warehouse_id
        ? (warehouseById.get(quant.warehouse_id) ?? null)
        : location?.warehouse_id
          ? (warehouseById.get(location.warehouse_id) ?? null)
          : null;

      const locationLabel = location
        ? `${warehouse?.code || warehouse?.name || "WH"}/${location.name}`
        : warehouse
          ? `${warehouse.code || warehouse.name}/Stock`
          : "Unassigned";

      if (query) {
        const searchable = [
          locationLabel,
          warehouse?.name || "",
          location?.name || "",
          product?.name || "",
          product?.reference || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(query)) return;
      }

      const key = `${warehouse?.id ?? 0}-${location?.id ?? 0}`;
      const existing = groups.get(key) ?? {
        key,
        warehouseId: warehouse?.id ?? null,
        locationId: location?.id ?? null,
        locationLabel,
        rowCount: 0,
        onHand: 0,
        reserved: 0,
        rows: [],
      };

      existing.rows.push({ quant, product, warehouse, location });
      existing.rowCount += 1;
      existing.onHand += Number.isFinite(quant.quantity) ? quant.quantity : 0;
      existing.reserved += Number.isFinite(quant.reserved_quantity)
        ? quant.reserved_quantity
        : 0;
      groups.set(key, existing);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: group.rows.sort((left, right) =>
          (left.product?.name || "").localeCompare(right.product?.name || ""),
        ),
      }))
      .sort((left, right) =>
        left.locationLabel.localeCompare(right.locationLabel),
      );
  }, [stockQuants, products, warehouses, locations, searchQuery]);

  const quantGroupPageSize = 20;

  const toggleQuantGroup = (groupKey: string) => {
    setExpandedQuantGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
    setQuantGroupPages((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey] ?? 1,
    }));
  };

  const changeQuantGroupPage = (groupKey: string, page: number) => {
    setQuantGroupPages((prev) => ({
      ...prev,
      [groupKey]: page,
    }));
  };

  // Stats
  const stats = {
    totalProducts: products.length,
    lowStock: products.filter(
      (p) => p.quantity_on_hand <= p.reorder_point && p.track_inventory,
    ).length,
    totalWarehouses: warehouses.length,
    totalLocations: locations.length,
    pendingMoves: stockMoves.filter((m) => m.state === "draft").length,
    totalStockValue: stockQuants.reduce((sum, q) => sum + q.total_value, 0),
  };

  const lowStockProducts = useMemo(
    () =>
      products
        .filter(
          (p) => p.quantity_on_hand <= p.reorder_point && p.track_inventory,
        )
        .slice(0, 6),
    [products],
  );

  const recentStockMoves = useMemo(
    () => filteredMoves.slice(0, 6),
    [filteredMoves],
  );

  const warehouseLocations = (warehouseId: number) =>
    locations.filter((l) => l.warehouse_id === warehouseId);

  const productFilterLocations = useMemo(() => {
    if (filterWarehouseId === null) return locations;
    return locations.filter(
      (location) => location.warehouse_id === filterWarehouseId,
    );
  }, [locations, filterWarehouseId]);

  useEffect(() => {
    if (!selectedProductId) {
      setQuickStockWarehouseId(null);
      setQuickStockLocationId(null);
      setQuickStockQuantity("0");
      return;
    }

    const topRow = selectedProductWarehouseRows[0];
    if (topRow) {
      setQuickStockWarehouseId(topRow.warehouseId);
      setQuickStockLocationId(topRow.locationId);
      setQuickStockQuantity(String(topRow.onHand));
      return;
    }

    const defaultWarehouseId = warehouses[0]?.id ?? null;
    const defaultLocationId =
      locations.find((l) => l.warehouse_id === defaultWarehouseId)?.id ??
      locations[0]?.id ??
      null;
    setQuickStockWarehouseId(defaultWarehouseId);
    setQuickStockLocationId(defaultLocationId);
    setQuickStockQuantity("0");
  }, [selectedProductId, selectedProductWarehouseRows, warehouses, locations]);

  useEffect(() => {
    if (filterLocationId === null) return;
    const activeLocation = locations.find(
      (location) => location.id === filterLocationId,
    );
    if (!activeLocation) {
      setFilterLocationId(null);
      return;
    }
    if (
      filterWarehouseId !== null &&
      activeLocation.warehouse_id !== filterWarehouseId
    ) {
      setFilterLocationId(null);
    }
  }, [filterLocationId, filterWarehouseId, locations]);

  const goBackToCompanies = () => {
    setCompanyId(null);
    setProducts([]);
    setCategories([]);
    setWarehouses([]);
    setLocations([]);
    setStockMoves([]);
    setStockQuants([]);
    setTaxSettings([]);
    navigate("/inventory");
  };

  if (companiesLoading && companyId === null) {
    return <div className="loading-indicator">Loading companies...</div>;
  }
  if (!isAdmin && companyId === null && companies.length) {
    return <div className="loading-indicator">Loading companies...</div>;
  }

  // ─── Admin company selection view ───
  if (isAdmin && !companyId) {
    return (
      <div className="content">
        <div className="inventory-company-search-row">
          <div className="company-search inventory-company-search-field">
            <input
              type="text"
              placeholder="Search company by name, VAT, or TIN"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
            />
          </div>
        </div>

        <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
          Select a company to view its inventory.
        </p>

        <div className="device-company-grid">
          {filteredCompanies.map((c) => (
            <button
              key={c.id}
              className="device-company-card"
              onClick={() => setCompanyId(c.id)}
            >
              <div className="device-company-icon">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                  <path d="M9 22v-4h6v4" />
                  <line x1="8" y1="6" x2="8" y2="6.01" />
                  <line x1="16" y1="6" x2="16" y2="6.01" />
                  <line x1="12" y1="6" x2="12" y2="6.01" />
                  <line x1="8" y1="10" x2="8" y2="10.01" />
                  <line x1="16" y1="10" x2="16" y2="10.01" />
                  <line x1="12" y1="10" x2="12" y2="10.01" />
                  <line x1="8" y1="14" x2="8" y2="14.01" />
                  <line x1="16" y1="14" x2="16" y2="14.01" />
                  <line x1="12" y1="14" x2="12" y2="14.01" />
                </svg>
              </div>
              <div className="device-company-info">
                <div className="device-company-name">{c.name}</div>
                {c.tin && (
                  <div className="device-company-detail">TIN: {c.tin}</div>
                )}
                {c.vat && (
                  <div className="device-company-detail">VAT: {c.vat}</div>
                )}
              </div>
              <div className="device-company-arrow">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
          {!filteredCompanies.length && (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: 40,
                color: "var(--muted)",
              }}
            >
              {companyQuery.trim()
                ? "No companies match your search."
                : "No companies found. Create a company first."}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============= RENDER =============
  return (
    <>
      <ValidationAlert message={error} onClose={() => setError(null)} />
      {/* Company breadcrumb for admin */}
      {isAdmin && companyId && (
        <div
          className="o-control-panel"
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
            padding: "0 8px",
          }}
        >
          <div className="o-breadcrumb">
            <span
              className="o-breadcrumb-item"
              style={{ cursor: "pointer" }}
              onClick={goBackToCompanies}
            >
              Inventory
            </span>
            <span className="o-breadcrumb-separator">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span className="o-breadcrumb-current">
              {selectedCompany?.name || "Company"}
            </span>
          </div>
        </div>
      )}
      <div
        className="page-container"
        style={{
          display: "flex",
          gap: 0,
          flexWrap: "nowrap",
        }}
      >
        <div
          id="main-content"
          className="two-panel two-panel-left inventory-workspace"
        >
          {/* Side Bar Navigation */}
          <Sidebar sections={menuSections} />

          <div className="o-main">
            {/* Form Sub Control Panel */}
            {subView === "form" && mainView !== "operations" && (
              <div
                className={`o-control-panel ${
                  mainView === "warehouses"
                    ? "inventory-record-header inventory-record-header-warehouse"
                    : ""
                }`}
                style={{ background: "var(--gray-50)", marginTop: -8 }}
              >
                <div className="o-control-panel-left inventory-record-header-left">
                  <button
                    className={`o-btn o-btn-link ${
                      mainView === "warehouses" ? "inventory-record-back" : ""
                    }`}
                    onClick={goBack}
                  >
                    ← Back to List
                  </button>
                  <span
                    className={
                      mainView === "warehouses"
                        ? "inventory-record-title inventory-record-title-warehouse"
                        : ""
                    }
                    style={{ fontWeight: 600, marginLeft: 16 }}
                  >
                    {mainView === "products" &&
                      (isNew ? "New Product" : selectedProduct?.name)}
                    {mainView === "warehouses" &&
                      (isNew ? "New Warehouse" : selectedWarehouse?.name)}
                  </span>
                </div>
                <div className="o-control-panel-right inventory-record-header-right">
                  <button
                    className={`o-btn o-btn-primary ${
                      mainView === "warehouses"
                        ? "inventory-record-action-btn"
                        : ""
                    }`}
                    onClick={() => {
                      if (mainView === "products") saveProduct();
                      else if (mainView === "warehouses") saveWarehouse();
                    }}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  {!isNew && (
                    <>
                      <button
                        className={
                          mainView === "warehouses"
                            ? "inventory-record-icon-btn inventory-record-icon-btn-danger"
                            : "danger"
                        }
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => {
                          if (mainView === "products" && selectedProductId)
                            deleteProduct(selectedProductId);
                          else if (
                            mainView === "warehouses" &&
                            selectedWarehouseId
                          )
                            deleteWarehouse(selectedWarehouseId);
                        }}
                        disabled={saving}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                  <button
                    className={`o-btn o-btn-secondary ${
                      mainView === "warehouses"
                        ? "inventory-record-action-btn"
                        : ""
                    }`}
                    onClick={goBack}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {/* Main Content */}
            <div
              className={`o-content inventory-content inventory-view-${mainView} inventory-subview-${subView}`}
              style={{
                flexWrap: "wrap",
                alignContent: "flex-start",
                rowGap: 12,
              }}
            >
              {/* Sub Control Panel */}
              {subView !== "form" && mainView !== "overview" && (
                <div
                  id="filters-search"
                  className="o-control-panel inventory-main-search-panel"
                  style={{
                    background: "var(--white-500)",
                    marginTop: "1rem",
                    width: "100%",
                    flex: "1 1 100%",
                  }}
                >
                  <div className="inventory-search-wrapper">
                    <div className="inventory-search-inner">
                      <div className="inventory-centered-searchbox">
                        <div className="o-searchbox">
                          <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          {(mainView === "operations" &&
                            operationsTab === "moves") ||
                          mainView === "products" ? (
                            <button
                              type="button"
                              className="inventory-filter-toggle-inside"
                              aria-label="Toggle filters"
                              onClick={() => {
                                if (
                                  mainView === "operations" &&
                                  operationsTab === "moves"
                                ) {
                                  setFilterMenuOpen((prev) => {
                                    if (!prev) {
                                      setProductFilterMenuOpen(false);
                                    }
                                    return !prev;
                                  });
                                } else {
                                  setProductFilterMenuOpen((prev) => {
                                    if (!prev) {
                                      setFilterMenuOpen(false);
                                    }
                                    return !prev;
                                  });
                                }
                              }}
                            >
                              <FunnelPlus size={16} />
                            </button>
                          ) : null}
                        </div>
                        {filterMenuOpen && (
                          <div
                            className="inventory-filter-dropdown"
                            ref={filterMenuRef}
                          >
                            <div className="inventory-filter-columns">
                              <div className="inventory-filter-column">
                                <div className="inventory-filter-title">
                                  State
                                </div>
                                <div className="inventory-filter-items">
                                  {["all", ...STATES.map((s) => s.value)].map(
                                    (state) => (
                                      <button
                                        key={state}
                                        type="button"
                                        className={`inventory-filter-chip ${
                                          filterState === state
                                            ? "inventory-filter-chip-active"
                                            : ""
                                        }`}
                                        onClick={() => setFilterState(state)}
                                      >
                                        {state === "all"
                                          ? "All"
                                          : STATES.find(
                                              (s) => s.value === state,
                                            )?.label}
                                      </button>
                                    ),
                                  )}
                                </div>
                              </div>
                              <div className="inventory-filter-column">
                                <div className="inventory-filter-title">
                                  Operation Type
                                </div>
                                <div className="inventory-filter-items">
                                  {[
                                    "all",
                                    ...MOVE_TYPES.map((t) => t.value),
                                  ].map((type) => (
                                    <button
                                      key={type}
                                      type="button"
                                      className={`inventory-filter-chip ${
                                        filterMoveType === type
                                          ? "inventory-filter-chip-active"
                                          : ""
                                      }`}
                                      onClick={() => setFilterMoveType(type)}
                                    >
                                      {type === "all"
                                        ? "All"
                                        : MOVE_TYPES.find(
                                            (t) => t.value === type,
                                          )?.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="inventory-filter-column">
                                <div className="inventory-filter-title">
                                  Currency
                                </div>
                                <div className="inventory-filter-items">
                                  <button
                                    type="button"
                                    className={`inventory-filter-chip ${
                                      filterCurrency === ""
                                        ? "inventory-filter-chip-active"
                                        : ""
                                    }`}
                                    onClick={() => setFilterCurrency("")}
                                  >
                                    All
                                  </button>
                                  {operationsCurrencyOptions.map((currency) => (
                                    <button
                                      key={currency}
                                      type="button"
                                      className={`inventory-filter-chip ${
                                        filterCurrency === currency
                                          ? "inventory-filter-chip-active"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        setFilterCurrency(currency)
                                      }
                                    >
                                      {currency}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {productFilterMenuOpen && (
                          <div
                            className="inventory-filter-dropdown"
                            ref={productFilterMenuRef}
                          >
                            <div className="inventory-filter-columns">
                              <div className="inventory-filter-column">
                                <div className="inventory-filter-title">
                                  Category
                                </div>
                                <div className="inventory-filter-items">
                                  <button
                                    type="button"
                                    className={`inventory-filter-chip ${
                                      filterCategoryId === null
                                        ? "inventory-filter-chip-active"
                                        : ""
                                    }`}
                                    onClick={() => setFilterCategoryId(null)}
                                  >
                                    All Products ({products.length})
                                  </button>
                                  {categories.map((category) => (
                                    <button
                                      key={category.id}
                                      type="button"
                                      className={`inventory-filter-chip ${
                                        filterCategoryId === category.id
                                          ? "inventory-filter-chip-active"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        setFilterCategoryId(category.id)
                                      }
                                    >
                                      {category.name} (
                                      {categoryProductCounts.get(category.id) ??
                                        0}
                                      )
                                    </button>
                                  ))}
                                </div>
                                {categories.length === 0 && (
                                  <div className="inventory-filter-note">
                                    No categories yet.
                                  </div>
                                )}
                              </div>
                              <div className="inventory-filter-column">
                                <div className="inventory-filter-title">
                                  Warehouse
                                </div>
                                <div className="inventory-filter-items">
                                  <button
                                    type="button"
                                    className={`inventory-filter-chip ${
                                      filterWarehouseId === null
                                        ? "inventory-filter-chip-active"
                                        : ""
                                    }`}
                                    onClick={() => setFilterWarehouseId(null)}
                                  >
                                    All Warehouses ({warehouses.length})
                                  </button>
                                  {warehouses.map((warehouse) => (
                                    <button
                                      key={warehouse.id}
                                      type="button"
                                      className={`inventory-filter-chip ${
                                        filterWarehouseId === warehouse.id
                                          ? "inventory-filter-chip-active"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        setFilterWarehouseId(warehouse.id)
                                      }
                                    >
                                      {warehouse.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="inventory-filter-column">
                                <div className="inventory-filter-title">
                                  Location
                                </div>
                                <div className="inventory-filter-items">
                                  <button
                                    type="button"
                                    className={`inventory-filter-chip ${
                                      filterLocationId === null
                                        ? "inventory-filter-chip-active"
                                        : ""
                                    }`}
                                    onClick={() => setFilterLocationId(null)}
                                  >
                                    {filterWarehouseId !== null
                                      ? `All Locations (${productFilterLocations.length})`
                                      : `All Locations (${locations.length})`}
                                  </button>
                                  {productFilterLocations.map((location) => (
                                    <button
                                      key={location.id}
                                      type="button"
                                      className={`inventory-filter-chip ${
                                        filterLocationId === location.id
                                          ? "inventory-filter-chip-active"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        setFilterLocationId(location.id)
                                      }
                                    >
                                      {location.name}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="inventory-filter-row">
                                <div className="inventory-filter-types">
                                  {PRODUCT_TYPES.map((type) => (
                                    <div
                                      key={type.value}
                                      className="inventory-filter-type"
                                    >
                                      <span>{type.label}</span>
                                      <span className="inventory-filter-type-count">
                                        {
                                          products.filter(
                                            (product) =>
                                              product.product_type ===
                                              type.value,
                                          ).length
                                        }
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* {mainView === "operations" && (
                      <div className="inventory-op-tabs">
                        <button
                          className={`o-btn ${operationsTab === "moves" ? "o-btn-primary" : "o-btn-secondary"}`}
                          onClick={() => setOperationsTab("moves")}
                        >
                          Stock Moves
                        </button>
                        <button
                          className={`o-btn ${operationsTab === "quants" ? "o-btn-primary" : "o-btn-secondary"}`}
                          onClick={() => setOperationsTab("quants")}
                        >
                          Stock On Hand
                        </button>
                        <button
                          className={`o-btn ${operationsTab === "adjustments" ? "o-btn-primary" : "o-btn-secondary"}`}
                          onClick={() => setOperationsTab("adjustments")}
                        >
                          Adjustments
                        </button>
                      </div>
                    )} */}
                  <div className="o-control-panel-right">
                    {/* {mainView === "operations" && operationsTab === "moves" && (
                      <div className="inventory-operations-filters">
                        <label className="inventory-filter-label">
                          <span>Status:</span>
                          <select
                            value={filterState}
                            onChange={(event) =>
                              setFilterState(event.target.value)
                            }
                            className="inventory-filter-select"
                          >
                            <option value="all">All</option>
                            {STATES.map((state) => (
                              <option key={state.value} value={state.value}>
                                {state.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="inventory-filter-label">
                          <span>Operation Type:</span>
                          <select
                            value={filterMoveType}
                            onChange={(event) =>
                              setFilterMoveType(event.target.value)
                            }
                            className="inventory-filter-select"
                          >
                            <option value="all">All</option>
                            {MOVE_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )} */}
                    {mainView === "products" && (
                      <div className="o-view-switcher">
                        <button
                          className={subView === "list" ? "active" : ""}
                          onClick={() => setSubView("list")}
                          title="List View"
                        >
                          List
                        </button>
                        <button
                          className={subView === "kanban" ? "active" : ""}
                          onClick={() => setSubView("kanban")}
                          title="Kanban View"
                        >
                          Grid
                        </button>
                      </div>
                    )}

                    {mainView === "products" && (
                      <>
                        <div className="inventory-products-toolbar-meta">
                          <div className="inventory-products-pager">
                            {/* <select
                              value={productsPageSize}
                              onChange={(event) =>
                                setProductsPageSize(Number(event.target.value))
                              }
                              className="inventory-products-page-size"
                              aria-label="Products per page"
                            >
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select> */}
                            <span className="inventory-products-pager-range">
                              {productFromItem}-
                              <input
                                type="number"
                                value={productsPageSize}
                                size={3}
                                onChange={(event) =>
                                  setProductsPageSize(
                                    Number(event.target.value),
                                  )
                                }
                                aria-label="Products per page"
                              />{" "}
                              / {filteredProducts.length}
                            </span>
                            <button
                              type="button"
                              className="inventory-products-pager-btn"
                              onClick={() =>
                                setProductsPage((current) =>
                                  Math.max(1, current - 1),
                                )
                              }
                              disabled={productsPage <= 1}
                              aria-label="Previous page"
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <button
                              type="button"
                              className="inventory-products-pager-btn"
                              onClick={() =>
                                setProductsPage((current) =>
                                  Math.min(productTotalPages, current + 1),
                                )
                              }
                              disabled={productsPage >= productTotalPages}
                              aria-label="Next page"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                        <input
                          ref={productImportInputRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="inventory-hidden-file-input"
                          onChange={(event) => void handleProductsImport(event)}
                        />
                        <button
                          className="o-btn o-btn-secondary inventory-inline-action-btn"
                          onClick={() => {
                            setImportExportTarget("products");
                            setShowImportExportModal(true);
                          }}
                          title="Import or export products"
                        >
                          <Upload size={14} />
                          <span>Import / Export</span>
                        </button>
                        {/* <button
                          className="o-btn o-btn-secondary"
                          onClick={() => openCategoryModal()}
                        >
                          + Category
                        </button> */}
                        <button
                          className="o-btn o-btn-primary"
                          onClick={startNewProduct}
                        >
                          + New Product
                        </button>
                      </>
                    )}

                    {mainView === "categories" && (
                      <button
                        className="o-btn o-btn-primary inventory-category-create-btn"
                        onClick={() => openCategoryModal()}
                      >
                        <Plus size={16} />
                        New Category
                      </button>
                    )}

                    {mainView === "warehouses" && (
                      <button
                        className="o-btn o-btn-primary"
                        onClick={startNewWarehouse}
                      >
                        + New Warehouse
                      </button>
                    )}

                    {mainView === "operations" && operationsTab === "moves" && (
                      <button
                        className="o-btn o-btn-secondary inventory-inline-action-btn"
                        onClick={() => {
                          setImportExportTarget("moves");
                          setShowImportExportModal(true);
                        }}
                        title="Export stock moves"
                      >
                        <Download size={14} />
                        <span>Export</span>
                      </button>
                    )}

                    {mainView === "operations" && operationsTab === "moves" && (
                      <button
                        className="o-btn o-btn-primary"
                        onClick={() => startNewMove()}
                      >
                        <CirclePlus size={14} />
                      </button>
                      // <div className="inventory-op-actions">
                      //   {MOVE_TYPES.filter((t) => t.value !== "adjustment").map(
                      //     (t) => (
                      //       <button
                      //         key={t.value}
                      //         className="o-btn o-btn-secondary"
                      //         onClick={() => startNewMove(t.value)}
                      //         title={t.label}
                      //       >
                      //         {t.label}
                      //       </button>
                      //     ),
                      //   )}
                      // </div>
                    )}
                    {mainView === "operations" &&
                      operationsTab === "adjustments" && (
                        <div className="inventory-op-actions">
                          <button
                            className="o-btn o-btn-secondary"
                            onClick={() =>
                              setShowOnlyChangedAdjustments((prev) => !prev)
                            }
                          >
                            {showOnlyChangedAdjustments
                              ? "Show All"
                              : "Show Changed"}
                          </button>
                          <button
                            className="o-btn o-btn-secondary"
                            onClick={resetCountedAdjustments}
                            disabled={applyingAdjustments}
                          >
                            Reset
                          </button>

                          <button
                            className="o-btn o-btn-primary"
                            onClick={() => void applyInventoryAdjustments()}
                            disabled={
                              applyingAdjustments ||
                              adjustmentRows.every((row) => !row.changed)
                            }
                          >
                            {applyingAdjustments
                              ? "Applying..."
                              : `Apply All (${adjustmentRows.filter((row) => row.changed).length})`}
                          </button>
                          <button
                            className="o-btn o-btn-primary"
                            onClick={addNewCountLine}
                          >
                            <PlusCircle size={16} />
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )}
              {/* ============= OVERVIEW ============= */}
              {mainView === "overview" && (
                <div className="inventory-overview">
                  <div className="inventory-stats-grid">
                    <button
                      className="inventory-stat-card clickable"
                      onClick={() => setMainView("products")}
                      type="button"
                    >
                      <span className="inventory-stat-icon">
                        <Package size={16} />
                      </span>
                      <div className="inventory-stat-value">
                        {stats.totalProducts}
                      </div>
                      <div className="inventory-stat-label">Products</div>
                    </button>

                    <div
                      className={`inventory-stat-card ${stats.lowStock > 0 ? "warning" : ""}`}
                    >
                      <span className="inventory-stat-icon warning">
                        <TriangleAlert size={16} />
                      </span>
                      <div className="inventory-stat-value">
                        {stats.lowStock}
                      </div>
                      <div className="inventory-stat-label">Low Stock</div>
                    </div>

                    <button
                      className="inventory-stat-card clickable"
                      onClick={() => setMainView("warehouses")}
                      type="button"
                    >
                      <span className="inventory-stat-icon">
                        <WarehouseGlyph size={16} />
                      </span>
                      <div className="inventory-stat-value">
                        {stats.totalWarehouses}
                      </div>
                      <div className="inventory-stat-label">Warehouses</div>
                    </button>

                    <button
                      className="inventory-stat-card clickable"
                      onClick={() => setMainView("operations")}
                      type="button"
                    >
                      <span className="inventory-stat-icon">
                        <Clock3 size={16} />
                      </span>
                      <div className="inventory-stat-value">
                        {stats.pendingMoves}
                      </div>
                      <div className="inventory-stat-label">Pending Moves</div>
                    </button>

                    <div className="inventory-stat-card">
                      <span className="inventory-stat-icon">
                        <DollarSign size={16} />
                      </span>
                      <div className="inventory-stat-value">
                        ${stats.totalStockValue.toFixed(2)}
                      </div>
                      <div className="inventory-stat-label">Stock Value</div>
                    </div>
                  </div>

                  <div className="inventory-overview-grid">
                    <section className="inventory-overview-panel">
                      <header className="inventory-panel-header">
                        <h4>
                          <Zap size={16} />
                          Quick Actions
                        </h4>
                      </header>
                      <div className="inventory-quick-actions">
                        {MOVE_TYPES.map((t) => (
                          <button
                            key={t.value}
                            className="inventory-quick-btn"
                            onClick={() => {
                              setMainView("operations");
                              if (t.value === "adjustment") {
                                setOperationsTab("adjustments");
                                setSubView("list");
                              } else {
                                setOperationsTab("moves");
                                startNewMove(t.value);
                              }
                            }}
                            type="button"
                          >
                            <span>{t.label}</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="inventory-overview-panel">
                      <header className="inventory-panel-header">
                        <h4>
                          <Clock3 size={16} />
                          Recent Stock Moves
                        </h4>
                      </header>
                      <div className="inventory-list">
                        {recentStockMoves.map((m) => {
                          const product = products.find(
                            (p) => p.id === m.product_id,
                          );
                          return (
                            <div key={m.id} className="inventory-list-row">
                              <div className="inventory-list-meta">
                                <span className="inventory-list-title">
                                  {m.reference ||
                                    `MOV/${String(m.id).padStart(5, "0")}`}
                                </span>
                                <span className="inventory-list-sub">
                                  {product?.name || "Unknown product"}
                                </span>
                              </div>
                              <span
                                className={`inventory-state state-${m.state || "draft"}`}
                              >
                                {STATES.find((s) => s.value === m.state)
                                  ?.label || m.state}
                              </span>
                            </div>
                          );
                        })}
                        {recentStockMoves.length === 0 && (
                          <div className="inventory-empty-state">
                            No stock moves yet
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="inventory-overview-panel">
                      <header className="inventory-panel-header warning">
                        <h4>
                          <TriangleAlert size={16} />
                          Low Stock Products
                        </h4>
                      </header>
                      <div className="inventory-list">
                        {lowStockProducts.map((p) => (
                          <div
                            key={p.id}
                            className="inventory-list-row warning"
                          >
                            <div className="inventory-list-meta">
                              <span className="inventory-list-title">
                                {p.name}
                              </span>
                              <span className="inventory-list-sub">
                                Reorder point: {p.reorder_point} {p.uom}
                              </span>
                            </div>
                            <span className="inventory-low-stock-count">
                              {Number.isFinite(p.quantity_on_hand)
                                ? p.quantity_on_hand
                                : 0}{" "}
                              / {p.reorder_point} {p.uom}
                            </span>
                          </div>
                        ))}
                        {lowStockProducts.length === 0 && (
                          <div className="inventory-empty-state success">
                            All products have sufficient stock
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="inventory-overview-panel inventory-warehouse-panel">
                    <header className="inventory-panel-header">
                      <h4>
                        <Boxes size={16} />
                        Warehouses
                      </h4>
                    </header>
                    <div className="inventory-list">
                      {warehouses.map((w) => (
                        <button
                          key={w.id}
                          className="inventory-list-row warehouse"
                          onClick={() => {
                            setMainView("warehouses");
                            openWarehouse(w);
                          }}
                          type="button"
                        >
                          <div className="inventory-list-meta">
                            <span className="inventory-list-title">
                              {w.name}
                            </span>
                            <span className="inventory-list-sub">
                              Code: {w.code}
                            </span>
                          </div>
                          <span className="inventory-list-sub">
                            {warehouseLocations(w.id).length} locations
                          </span>
                        </button>
                      ))}
                      {warehouses.length === 0 && (
                        <div className="inventory-empty-state">
                          <button
                            className="o-btn o-btn-primary"
                            onClick={() => {
                              setMainView("warehouses");
                              startNewWarehouse();
                            }}
                          >
                            + Create First Warehouse
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* ============= PRODUCTS LIST ============= */}
              {mainView === "products" && subView === "list" && (
                <div className="o-main inventory-view-main">
                  <div className="o-list-view inventory-table-panel">
                    {selectedProductIds.size > 0 && (
                      <div className="batch-action-bar">
                        <label className="batch-master-toggle">
                          <input
                            type="checkbox"
                            checked={allFilteredProductsSelected}
                            onChange={toggleSelectAllProducts}
                            className="batch-checkbox"
                          />
                          <span>Select all</span>
                        </label>
                        <span className="batch-count">
                          {selectedProductIds.size} selected
                        </span>
                        <button
                          className="batch-btn export-btn"
                          onClick={exportSelectedProducts}
                          disabled={exportingSelectedProducts}
                        >
                          {exportingSelectedProducts
                            ? "Exporting..."
                            : "Export Selected"}
                        </button>
                        <button
                          className="batch-btn delete-btn"
                          onClick={deleteSelectedProducts}
                          disabled={saving}
                        >
                          {saving
                            ? "Deleting..."
                            : `Delete (${selectedProductIds.size})`}
                        </button>
                        <button
                          className="batch-btn clear-btn"
                          onClick={() => setSelectedProductIds(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <table className="o-list-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>
                            <input
                              type="checkbox"
                              checked={allFilteredProductsSelected}
                              onChange={toggleSelectAllProducts}
                              className="batch-checkbox"
                            />
                          </th>
                          <th className="inventory-col-icon"></th>
                          <th>Product</th>
                          <th>Reference</th>
                          <th>Location</th>
                          <th>Category</th>
                          <th>Type</th>
                          <th>On Hand</th>
                          <th>Available</th>
                          <th className="text-end">Sale Price</th>
                          <th className="text-end">Sale Cost</th>
                          <th className="text-end">Cost</th>
                          <th className="text-end">Stock Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedProducts.map((p) => {
                          const category = categories.find(
                            (c) => c.id === p.category_id,
                          );
                          return (
                            <tr
                              key={p.id}
                              className={
                                selectedProductIds.has(p.id)
                                  ? "row-selected inventory-table-clickable"
                                  : "inventory-table-clickable"
                              }
                              onDoubleClick={() => openProduct(p)}
                            >
                              <td onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedProductIds.has(p.id)}
                                  onChange={() => toggleSelectProduct(p.id)}
                                  className="batch-checkbox"
                                  aria-label={`Select ${p.name}`}
                                />
                              </td>
                              <td>
                                <span
                                  className="inventory-link-cell"
                                  onClick={() => openProduct(p)}
                                >
                                  {p.name}
                                </span>
                                {p.barcode && (
                                  <div className="inventory-subtext">
                                    {p.barcode}
                                  </div>
                                )}
                              </td>
                              <td>{p.reference || "-"}</td>
                              <td>{productLocationById.get(p.id) || "-"}</td>
                              <td>{category?.name || "Uncategorized"}</td>
                              <td>
                                <span
                                  className={`o-tag o-tag-${p.product_type === "storable" ? "in" : p.product_type === "service" ? "internal" : "out"}`}
                                >
                                  {
                                    PRODUCT_TYPES.find(
                                      (t) => t.value === p.product_type,
                                    )?.label
                                  }
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="o-btn o-btn-link inventory-qty-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openOnHandAdjustment(p);
                                  }}
                                  onDoubleClick={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  {Number.isFinite(p.quantity_on_hand)
                                    ? p.quantity_on_hand
                                    : 0}{" "}
                                  {p.uom}
                                </button>
                              </td>
                              <td className="inventory-positive">
                                {p.quantity_available} {p.uom}
                              </td>
                              <td className="o-monetary">
                                ${p.sale_price.toFixed(2)}
                              </td>
                              <td className="o-monetary">
                                ${p.sales_cost.toFixed(2)}
                              </td>
                              <td className="o-monetary">
                                ${p.purchase_cost.toFixed(2)}
                              </td>
                              <td className="o-monetary inventory-strong-cell">
                                ${p.stock_value.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredProducts.length === 0 && (
                          <tr>
                            <td colSpan={13} className="inventory-empty-row">
                              <button
                                className="o-btn o-btn-primary"
                                onClick={startNewProduct}
                              >
                                + Create Product
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={9} className="inventory-totals-label">
                            Totals:
                          </td>
                          <td className="o-monetary inventory-totals-value">
                            ${productMonetaryTotals.salePrice.toFixed(2)}
                          </td>
                          <td className="o-monetary inventory-totals-value">
                            ${productMonetaryTotals.salesCost.toFixed(2)}
                          </td>
                          <td className="o-monetary inventory-totals-value">
                            ${productMonetaryTotals.purchaseCost.toFixed(2)}
                          </td>
                          <td className="o-monetary inventory-totals-value">
                            ${productMonetaryTotals.stockValue.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ============= CATEGORIES LIST ============= */}
              {mainView === "categories" && subView === "list" && (
                <div className="o-main" style={{ width: "100%" }}>
                  <div className="o-list-view inventory-table-panel">
                    <table className="o-list-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Products</th>
                          <th>On Hand</th>
                          <th style={{ width: 160 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCategories.map((c) => {
                          const categoryKey = `${c.isDefault ? "default" : "category"}-${c.id}`;
                          const isExpanded =
                            expandedCategoryKeys.has(categoryKey);
                          const totalPages = Math.max(
                            1,
                            Math.ceil(c.products.length / categoryPageSize),
                          );
                          const currentPage = Math.min(
                            categoryPages[categoryKey] ?? 1,
                            totalPages,
                          );
                          const fromItem =
                            c.products.length === 0
                              ? 0
                              : (currentPage - 1) * categoryPageSize + 1;
                          const toItem = Math.min(
                            c.products.length,
                            currentPage * categoryPageSize,
                          );
                          const visibleProducts = c.products.slice(
                            (currentPage - 1) * categoryPageSize,
                            currentPage * categoryPageSize,
                          );

                          return (
                            <Fragment key={categoryKey}>
                              <tr className="inventory-table-clickable">
                                <td>
                                  <button
                                    type="button"
                                    className="inventory-quant-group-toggle"
                                    onClick={() =>
                                      toggleCategoryGroup(categoryKey)
                                    }
                                  >
                                    <span
                                      className={`inventory-quant-group-chevron ${isExpanded ? "is-open" : ""}`}
                                    >
                                      <ChevronDown size={14} />
                                    </span>
                                    <div className="inventory-category-name-cell">
                                      {/* <span className="inventory-category-name-icon">
                                        <LayoutGrid size={16} />
                                      </span> */}
                                      <div>
                                        <span className="inventory-category-name-text">
                                          {c.name}
                                        </span>
                                        {/* {c.isDefault && (
                                          <div className="inventory-category-name-subtext">
                                            Default category for products
                                            without an assigned category
                                          </div>
                                        )} */}
                                      </div>
                                    </div>
                                  </button>
                                </td>
                                <td>
                                  <div className="inventory-category-products-cell">
                                    <span className="inventory-category-count-badge">
                                      {c.products.length}
                                    </span>
                                    {c.products.length > 0 && (
                                      <div className="inventory-quant-group-pager">
                                        <span>
                                          {fromItem}-{toItem} /{" "}
                                          {c.products.length}
                                        </span>
                                        <button
                                          type="button"
                                          className="inventory-quant-group-page-btn"
                                          disabled={currentPage <= 1}
                                          onClick={() =>
                                            changeCategoryPage(
                                              categoryKey,
                                              currentPage - 1,
                                            )
                                          }
                                        >
                                          <ChevronLeft size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          className="inventory-quant-group-page-btn"
                                          disabled={currentPage >= totalPages}
                                          onClick={() =>
                                            changeCategoryPage(
                                              categoryKey,
                                              currentPage + 1,
                                            )
                                          }
                                        >
                                          <ChevronRight size={14} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="inventory-strong-cell">
                                  {c.products
                                    .reduce(
                                      (sum, product) =>
                                        sum +
                                        (Number.isFinite(
                                          product.quantity_on_hand,
                                        )
                                          ? product.quantity_on_hand
                                          : 0),
                                      0,
                                    )
                                    .toFixed(2)}
                                </td>
                                <td className="inventory-category-actions-cell">
                                  <div className="inventory-category-actions">
                                    {!c.isDefault && (
                                      <>
                                        <button
                                          type="button"
                                          className="inventory-category-action-btn"
                                          aria-label={`Edit ${c.name}`}
                                          onClick={() =>
                                            c.category &&
                                            openCategoryModal(c.category)
                                          }
                                        >
                                          <PenLine size={15} />
                                        </button>
                                        <button
                                          type="button"
                                          className="inventory-category-action-btn inventory-category-action-btn-danger"
                                          aria-label={`Delete ${c.name}`}
                                          onClick={() => deleteCategory(c.id)}
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded &&
                                (visibleProducts.length ? (
                                  visibleProducts.map((product) => (
                                    <tr
                                      key={`category-product-${categoryKey}-${product.id}`}
                                      className="inventory-category-child-row"
                                    >
                                      <td />
                                      <td>
                                        <button
                                          type="button"
                                          className="inventory-category-product-pill"
                                          onClick={() => openProduct(product)}
                                        >
                                          {product.name}
                                        </button>
                                      </td>
                                      <td className="inventory-strong-cell">
                                        {Number.isFinite(
                                          product.quantity_on_hand,
                                        )
                                          ? `${product.quantity_on_hand} ${product.uom}`
                                          : `0 ${product.uom}`}
                                      </td>
                                      <td />
                                    </tr>
                                  ))
                                ) : (
                                  <tr className="inventory-category-child-row">
                                    <td />
                                    <td>
                                      <span className="inventory-category-empty-products">
                                        No products yet
                                      </span>
                                    </td>
                                    <td />
                                    <td />
                                  </tr>
                                ))}
                            </Fragment>
                          );
                        })}
                        {filteredCategories.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              style={{ textAlign: "center", padding: 40 }}
                            >
                              {categories.length === 0 ? (
                                <button
                                  className="o-btn o-btn-primary"
                                  onClick={() => openCategoryModal()}
                                >
                                  + Create Category
                                </button>
                              ) : (
                                <span style={{ color: "var(--muted)" }}>
                                  No categories match your search.
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ============= PRODUCTS KANBAN ============= */}
              {mainView === "products" && subView === "kanban" && (
                <div className="o-main inventory-view-main">
                  <div className="o-kanban inventory-product-kanban">
                    {pagedProducts.map((p) => {
                      const category = categories.find(
                        (c) => c.id === p.category_id,
                      );
                      return (
                        <div
                          key={p.id}
                          className="o-kanban-card"
                          onClick={() => openProduct(p)}
                        >
                          <div className="o-kanban-header">
                            <div>
                              <div className="o-kanban-title">{p.name}</div>
                              <div className="o-kanban-subtitle">
                                {p.reference || p.barcode || "No reference"}
                              </div>
                            </div>
                            <span className="inventory-kanban-icon">
                              <Package size={18} />
                            </span>
                          </div>
                          <div className="o-kanban-body">
                            <div className="inventory-kanban-meta-row">
                              <span className="inventory-kanban-muted">
                                On Hand
                              </span>
                              <span>
                                <button
                                  type="button"
                                  className="o-btn o-btn-link inventory-qty-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openOnHandAdjustment(p);
                                  }}
                                >
                                  {Number.isFinite(p.quantity_on_hand)
                                    ? p.quantity_on_hand
                                    : 0}{" "}
                                  {p.uom}
                                </button>
                              </span>
                            </div>
                            <div className="inventory-kanban-meta-row">
                              <span className="inventory-kanban-muted">
                                Sale Price
                              </span>
                              <span>${p.sale_price.toFixed(2)}</span>
                            </div>
                            <div className="inventory-kanban-meta-row">
                              <span className="inventory-kanban-muted">
                                Stock Value
                              </span>
                              <span className="inventory-kanban-strong">
                                ${p.stock_value.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="o-kanban-footer">
                            <div className="o-kanban-tags">
                              {category && (
                                <span className="o-tag o-tag-draft">
                                  {category.name}
                                </span>
                              )}
                              <span
                                className={`o-tag o-tag-${p.is_active ? "done" : "cancelled"}`}
                              >
                                {p.is_active ? "Active" : "Archived"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ============= PRODUCT FORM ============= */}
              {mainView === "products" && subView === "form" && (
                <div
                  className="o-main inventory-view-main"
                  style={{ width: "100%" }}
                >
                  <div className="o-form-view inventory-form-panel">
                    <div className="o-form-sheet">
                      <div
                        style={{
                          display: "flex",
                          gap: 24,
                          marginBottom: 24,
                          alignItems: "flex-start",
                        }}
                      >
                        {/* Product Image */}
                        <div
                          style={{
                            width: 110,
                            height: 110,
                            borderRadius: 10,
                            border: "2px dashed var(--zinc-300, #d4d4d8)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            flexShrink: 0,
                            background: productImageUrl
                              ? "transparent"
                              : "var(--gray-50, #f9fafb)",
                            cursor: "pointer",
                            position: "relative",
                          }}
                          onClick={() => imageInputRef.current?.click()}
                          title={
                            selectedProductId
                              ? "Click to upload image"
                              : "Choose image to upload when saved"
                          }
                        >
                          {productImageUrl ? (
                            <>
                              <img
                                src={productImageUrl}
                                alt="Product"
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                              {(selectedProductId || isNew) && (
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    background: "rgba(0,0,0,0.4)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                    opacity: 0,
                                    transition: "opacity 0.2s",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.opacity = "1")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.opacity = "0")
                                  }
                                >
                                  <button
                                    className="o-btn"
                                    style={{
                                      background: "#fff",
                                      color: "#333",
                                      fontSize: 11,
                                      padding: "4px 8px",
                                      borderRadius: 4,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      imageInputRef.current?.click();
                                    }}
                                    disabled={uploadingImage}
                                  >
                                    Change
                                  </button>
                                  <button
                                    className="o-btn"
                                    style={{
                                      background: "#ef4444",
                                      color: "#fff",
                                      fontSize: 11,
                                      padding: "4px 8px",
                                      borderRadius: 4,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleProductImageDelete();
                                    }}
                                    disabled={uploadingImage}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </>
                          ) : uploadingImage ? (
                            <span
                              style={{ fontSize: 12, color: "var(--gray-400)" }}
                            >
                              Uploading…
                            </span>
                          ) : (
                            <svg
                              width="36"
                              height="36"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--zinc-300)"
                              strokeWidth="1.5"
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                          )}
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleProductImageUpload}
                          />
                        </div>

                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <input
                              type="text"
                              className={`o-form-input ${
                                invalidProductFields.includes("name")
                                  ? "input-field-error"
                                  : ""
                              }`}
                              placeholder="Product Name"
                              value={productForm.name}
                              onChange={(e) => {
                                setProductForm({
                                  ...productForm,
                                  name: e.target.value,
                                });
                                clearInvalidProductField(
                                  "name",
                                  e.target.value,
                                );
                              }}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 24,
                                fontWeight: 600,
                                border: "none",
                                borderBottom: "2px solid var(--zinc-200)",
                                borderRadius: 0,
                                padding: "8px 0",
                              }}
                            />
                            <span
                              className="o-tag o-tag-confirmed"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              On Hand: {selectedProductStock.onHand.toFixed(2)}{" "}
                              {selectedProduct?.uom || productForm.uom}
                            </span>
                          </div>
                          <div
                            style={{ marginTop: 8, display: "flex", gap: 8 }}
                          >
                            <span
                              className={`o-tag ${productForm.can_be_sold ? "o-tag-done" : "o-tag-draft"}`}
                            >
                              {productForm.can_be_sold
                                ? "Can be Sold"
                                : "Not for Sale"}
                            </span>
                            <span
                              className={`o-tag ${productForm.can_be_purchased ? "o-tag-confirmed" : "o-tag-draft"}`}
                            >
                              {productForm.can_be_purchased
                                ? "Can be Purchased"
                                : "Not for Purchase"}
                            </span>
                            <span
                              className={`o-tag ${productForm.show_in_pos ? "o-tag-confirmed" : "o-tag-draft"}`}
                            >
                              {productForm.show_in_pos
                                ? "Visible in POS"
                                : "Hidden in POS"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 24, display: "flex", gap: 24 }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={productForm.can_be_sold}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                can_be_sold: e.target.checked,
                              })
                            }
                          />
                          Can be Sold
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={productForm.can_be_purchased}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                can_be_purchased: e.target.checked,
                              })
                            }
                          />
                          Can be Purchased
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={productForm.show_in_pos}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                show_in_pos: e.target.checked,
                              })
                            }
                          />
                          Show in POS
                        </label>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={productForm.is_active}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                is_active: e.target.checked,
                              })
                            }
                          />
                          Active
                        </label>
                      </div>

                      <div
                        className="tabs-nav"
                        style={{ marginTop: 16, marginBottom: 20 }}
                      >
                        <button
                          className={`tab-btn ${productInfoTab === "general" ? "active" : ""}`}
                          onClick={() => setProductInfoTab("general")}
                        >
                          General
                        </button>
                        <button
                          className={`tab-btn ${productInfoTab === "inventory" ? "active" : ""}`}
                          onClick={() => setProductInfoTab("inventory")}
                          disabled={productForm.product_type !== "storable"}
                          style={
                            productForm.product_type !== "storable"
                              ? { opacity: 0.5, cursor: "not-allowed" }
                              : undefined
                          }
                          title={
                            productForm.product_type !== "storable"
                              ? "Inventory is only for storable products"
                              : undefined
                          }
                        >
                          Inventory
                        </button>
                        <button
                          className={`tab-btn ${productInfoTab === "description" ? "active" : ""}`}
                          onClick={() => setProductInfoTab("description")}
                        >
                          Description
                        </button>
                        <button
                          className={`tab-btn ${productInfoTab === "location" ? "active" : ""}`}
                          onClick={() => setProductInfoTab("location")}
                        >
                          Location
                        </button>
                      </div>

                      {productInfoTab === "general" && (
                        <>
                          <div className="o-group-separator">
                            <div className="o-group-separator-line" />
                            <span className="o-group-separator-text">
                              General Information
                            </span>
                            <div className="o-group-separator-line" />
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 24,
                            }}
                          >
                            <div>
                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Product Type
                                </label>
                                <div className="o-form-field">
                                  <select
                                    className="o-form-select"
                                    value={productForm.product_type}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        product_type: e.target.value,
                                      })
                                    }
                                  >
                                    {PRODUCT_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">Category</label>
                                <div className="o-form-field">
                                  <select
                                    className="o-form-select"
                                    value={productForm.category_id ?? ""}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        category_id: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      })
                                    }
                                  >
                                    <option value="">Uncategorized</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Product Code
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="text"
                                    className="o-form-input"
                                    value={productForm.reference}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        reference: e.target.value,
                                      })
                                    }
                                    placeholder="e.g., PROD-001"
                                  />
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">Barcode</label>
                                <div className="o-form-field">
                                  <input
                                    type="text"
                                    className="o-form-input"
                                    value={productForm.barcode}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        barcode: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Sales Price
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="number"
                                    className="o-form-input"
                                    value={productForm.sale_price}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        sale_price: Number(e.target.value),
                                      })
                                    }
                                    step="0.01"
                                    min="0"
                                  />
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Sales Cost
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="number"
                                    className="o-form-input"
                                    value={productForm.sales_cost}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        sales_cost: Number(e.target.value),
                                      })
                                    }
                                    step="0.01"
                                    min="0"
                                  />
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Purchase Cost
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="number"
                                    className="o-form-input"
                                    value={productForm.purchase_cost}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        purchase_cost: Number(e.target.value),
                                      })
                                    }
                                    step="0.01"
                                    min="0"
                                  />
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">
                                  ZIMRA Tax
                                </label>
                                <div className="o-form-field">
                                  <select
                                    className="o-form-select"
                                    value={productForm.tax_id ?? ""}
                                    onChange={(e) => {
                                      const tid = e.target.value
                                        ? Number(e.target.value)
                                        : null;
                                      const matched = taxSettings.find(
                                        (t) => t.id === tid,
                                      );
                                      setProductForm({
                                        ...productForm,
                                        tax_id: tid,
                                        tax_rate: matched
                                          ? matched.rate
                                          : productForm.tax_rate,
                                      });
                                    }}
                                  >
                                    <option value="">— Manual rate —</option>
                                    {taxSettings
                                      .filter((t) => t.is_active)
                                      .map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name} ({t.rate}%)
                                          {t.is_zimra_tax && t.zimra_tax_id
                                            ? ` [ZIMRA ID: ${t.zimra_tax_id}]`
                                            : ""}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Tax Rate (%)
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="number"
                                    className="o-form-input"
                                    value={productForm.tax_rate}
                                    onChange={(e) =>
                                      setProductForm({
                                        ...productForm,
                                        tax_rate: Number(e.target.value),
                                      })
                                    }
                                    step="0.1"
                                    min="0"
                                    disabled={!!productForm.tax_id}
                                  />
                                </div>
                              </div>

                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Unit of Measure
                                </label>
                                <div className="o-form-field">
                                  <select
                                    className={`o-form-select ${
                                      invalidProductFields.includes("uom")
                                        ? "input-field-error"
                                        : ""
                                    }`}
                                    value={productForm.uom}
                                    onChange={(e) => {
                                      setProductForm({
                                        ...productForm,
                                        uom: e.target.value,
                                      });
                                      clearInvalidProductField(
                                        "uom",
                                        e.target.value,
                                      );
                                    }}
                                  >
                                    {UOMS.map((u) => (
                                      <option key={u.value} value={u.value}>
                                        {u.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {productInfoTab === "inventory" &&
                        productForm.product_type === "storable" && (
                          <>
                            <div className="o-group-separator">
                              <div className="o-group-separator-line" />
                              <span className="o-group-separator-text">
                                Inventory
                              </span>
                              <div className="o-group-separator-line" />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: 24,
                                marginBottom: 16,
                              }}
                            >
                              <div className="o-form-group">
                                <label className="o-form-label">
                                  On Hand (
                                  {selectedProduct?.uom || productForm.uom})
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="text"
                                    className="o-form-input"
                                    value={selectedProductStock.onHand.toFixed(
                                      2,
                                    )}
                                    readOnly
                                  />
                                </div>
                              </div>
                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Available (
                                  {selectedProduct?.uom || productForm.uom})
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="text"
                                    className="o-form-input"
                                    value={selectedProductStock.available.toFixed(
                                      2,
                                    )}
                                    readOnly
                                  />
                                </div>
                              </div>
                              <div className="o-form-group">
                                <label className="o-form-label">
                                  Reserved (
                                  {selectedProduct?.uom || productForm.uom})
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="text"
                                    className="o-form-input"
                                    value={selectedProductStock.reserved.toFixed(
                                      2,
                                    )}
                                    readOnly
                                  />
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 24,
                              }}
                            >
                              <div>
                                <div className="o-form-group">
                                  <label className="o-form-label">
                                    Reorder Point
                                  </label>
                                  <div className="o-form-field">
                                    <input
                                      type="number"
                                      className="o-form-input"
                                      value={productForm.reorder_point}
                                      onChange={(e) =>
                                        setProductForm({
                                          ...productForm,
                                          reorder_point: Number(e.target.value),
                                        })
                                      }
                                      min="0"
                                    />
                                  </div>
                                </div>
                                <div className="o-form-group">
                                  <label className="o-form-label">
                                    Maximum Stock
                                  </label>
                                  <div className="o-form-field">
                                    <input
                                      type="number"
                                      className="o-form-input"
                                      value={productForm.max_stock_quantity}
                                      onChange={(e) =>
                                        setProductForm({
                                          ...productForm,
                                          max_stock_quantity: Number(
                                            e.target.value,
                                          ),
                                        })
                                      }
                                      min="0"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="o-form-group">
                                  <label className="o-form-label">
                                    Minimum Stock
                                  </label>
                                  <div className="o-form-field">
                                    <input
                                      type="number"
                                      className="o-form-input"
                                      value={productForm.min_stock_quantity}
                                      onChange={(e) =>
                                        setProductForm({
                                          ...productForm,
                                          min_stock_quantity: Number(
                                            e.target.value,
                                          ),
                                        })
                                      }
                                      min="0"
                                    />
                                  </div>
                                </div>
                                <div className="o-form-group">
                                  <label className="o-form-label">
                                    Track Inventory
                                  </label>
                                  <div className="o-form-field">
                                    <select
                                      className="o-form-select"
                                      value={
                                        productForm.track_inventory
                                          ? "yes"
                                          : "no"
                                      }
                                      onChange={(e) =>
                                        setProductForm({
                                          ...productForm,
                                          track_inventory:
                                            e.target.value === "yes",
                                        })
                                      }
                                    >
                                      <option value="yes">Yes</option>
                                      <option value="no">No</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 24,
                                marginTop: 16,
                              }}
                            >
                              <div>
                                <div className="o-form-group">
                                  <label className="o-form-label">Weight</label>
                                  <div className="o-form-field">
                                    <input
                                      type="number"
                                      className="o-form-input"
                                      value={productForm.weight}
                                      onChange={(e) =>
                                        setProductForm({
                                          ...productForm,
                                          weight: Number(e.target.value),
                                        })
                                      }
                                      step="0.01"
                                      min="0"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="o-form-group">
                                  <label className="o-form-label">
                                    Weight UOM
                                  </label>
                                  <div className="o-form-field">
                                    <input
                                      type="text"
                                      className="o-form-input"
                                      value={productForm.weight_uom}
                                      onChange={(e) =>
                                        setProductForm({
                                          ...productForm,
                                          weight_uom: e.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                      {productInfoTab === "description" && (
                        <>
                          <div className="o-group-separator">
                            <div className="o-group-separator-line" />
                            <span className="o-group-separator-text">
                              Product Description
                            </span>
                            <div className="o-group-separator-line" />
                          </div>

                          <textarea
                            className="o-form-textarea"
                            rows={4}
                            value={productForm.description}
                            onChange={(e) =>
                              setProductForm({
                                ...productForm,
                                description: e.target.value,
                              })
                            }
                            placeholder="Product description..."
                            style={{ width: "100%" }}
                          />
                        </>
                      )}

                      {productInfoTab === "location" && (
                        <>
                          <div className="o-group-separator">
                            <div className="o-group-separator-line" />
                            <span className="o-group-separator-text">
                              Inventory location
                            </span>
                            <div className="o-group-separator-line" />
                          </div>

                          <div
                            style={{
                              marginBottom: 18,
                              border: "1px solid var(--zinc-200)",
                              borderRadius: 10,
                              padding: 14,
                              background: "var(--zinc-50)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 10,
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: 14 }}>
                                Stock by Warehouse / Location
                              </span>
                              <span
                                style={{
                                  color: "var(--muted)",
                                  fontSize: 12,
                                }}
                              >
                                Use multiple warehouses by adjusting stock per
                                location below.
                              </span>
                            </div>

                            <div className="o-inline-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Warehouse</th>
                                    <th>Location</th>
                                    <th>On Hand</th>
                                    <th>Available</th>
                                    <th>Reserved</th>
                                    <th style={{ width: 170 }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedProductWarehouseRows.map((row) => (
                                    <tr key={row.quantId}>
                                      <td>{row.warehouseName}</td>
                                      <td>{row.locationName}</td>
                                      <td>{row.onHand.toFixed(2)}</td>
                                      <td>{row.available.toFixed(2)}</td>
                                      <td>{row.reserved.toFixed(2)}</td>
                                      <td>
                                        <button
                                          className="o-btn o-btn-link"
                                          style={{
                                            padding: "4px 8px",
                                            fontSize: 12,
                                          }}
                                          onClick={() => {
                                            setQuickStockWarehouseId(
                                              row.warehouseId,
                                            );
                                            setQuickStockLocationId(
                                              row.locationId,
                                            );
                                            setQuickStockQuantity(
                                              String(row.onHand),
                                            );
                                          }}
                                        >
                                          Use
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  {selectedProductWarehouseRows.length ===
                                    0 && (
                                    <tr>
                                      <td
                                        colSpan={6}
                                        style={{
                                          textAlign: "center",
                                          color: "var(--muted)",
                                        }}
                                      >
                                        No warehouse stock yet. Pick a warehouse
                                        and set quantity below.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>

                            <div
                              style={{
                                marginTop: 12,
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr auto",
                                gap: 10,
                                alignItems: "end",
                              }}
                            >
                              <div
                                className="o-form-group"
                                style={{ margin: 0 }}
                              >
                                <label className="o-form-label">
                                  Warehouse
                                </label>
                                <div className="o-form-field">
                                  <select
                                    className="o-form-select"
                                    value={quickStockWarehouseId ?? ""}
                                    onChange={(e) => {
                                      const warehouseId = e.target.value
                                        ? Number(e.target.value)
                                        : null;
                                      const firstLocation =
                                        locations.find(
                                          (l) => l.warehouse_id === warehouseId,
                                        ) ?? null;
                                      const currentQuant =
                                        selectedProductWarehouseRows.find(
                                          (row) =>
                                            row.warehouseId === warehouseId &&
                                            row.locationId ===
                                              firstLocation?.id,
                                        );
                                      setQuickStockWarehouseId(warehouseId);
                                      setQuickStockLocationId(
                                        firstLocation?.id ?? null,
                                      );
                                      setQuickStockQuantity(
                                        String(currentQuant?.onHand ?? 0),
                                      );
                                    }}
                                  >
                                    <option value="">
                                      Select warehouse...
                                    </option>
                                    {warehouses.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div
                                className="o-form-group"
                                style={{ margin: 0 }}
                              >
                                <label className="o-form-label">Location</label>
                                <div className="o-form-field">
                                  <select
                                    className="o-form-select"
                                    value={quickStockLocationId ?? ""}
                                    onChange={(e) => {
                                      const locationId = e.target.value
                                        ? Number(e.target.value)
                                        : null;
                                      const currentQuant =
                                        selectedProductWarehouseRows.find(
                                          (row) =>
                                            row.warehouseId ===
                                              quickStockWarehouseId &&
                                            row.locationId === locationId,
                                        );
                                      setQuickStockLocationId(locationId);
                                      setQuickStockQuantity(
                                        String(currentQuant?.onHand ?? 0),
                                      );
                                    }}
                                  >
                                    <option value="">Select location...</option>
                                    {locations
                                      .filter(
                                        (l) =>
                                          !quickStockWarehouseId ||
                                          l.warehouse_id ===
                                            quickStockWarehouseId,
                                      )
                                      .map((l) => (
                                        <option key={l.id} value={l.id}>
                                          {l.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              </div>

                              <div
                                className="o-form-group"
                                style={{ margin: 0 }}
                              >
                                <label className="o-form-label">
                                  Set Quantity
                                </label>
                                <div className="o-form-field">
                                  <input
                                    type="number"
                                    className="o-form-input"
                                    value={quickStockQuantity}
                                    onChange={(e) =>
                                      setQuickStockQuantity(e.target.value)
                                    }
                                    min="0"
                                    step="0.01"
                                  />
                                </div>
                              </div>

                              <button
                                className="o-btn o-btn-primary"
                                onClick={applyQuickStockAdjustment}
                                disabled={
                                  quickAdjustingStock ||
                                  !quickStockWarehouseId ||
                                  !quickStockLocationId
                                }
                              >
                                {quickAdjustingStock
                                  ? "Applying..."
                                  : "Apply Adjustment"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ============= WAREHOUSES LIST ============= */}
              {mainView === "warehouses" && subView === "list" && (
                <div className="o-main inventory-view-main">
                  <div className="inventory-warehouse-list-wrap">
                    <div
                      className="inventory-warehouse-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(350px, 1fr))",
                        gap: 20,
                        padding: "1rem",
                      }}
                    >
                      {warehouses.map((w) => {
                        const locs = warehouseLocations(w.id);
                        const warehouseQuants = stockQuants.filter(
                          (q) => q.warehouse_id === w.id,
                        );
                        const totalValue = warehouseQuants.reduce(
                          (sum, q) => sum + q.total_value,
                          0,
                        );
                        const totalItems = warehouseQuants.reduce(
                          (sum, q) => sum + q.quantity,
                          0,
                        );

                        return (
                          <div
                            key={w.id}
                            className="o-form-sheet inventory-warehouse-card"
                            style={{ cursor: "pointer" }}
                            onClick={() => openWarehouse(w)}
                          >
                            <div className="inventory-warehouse-card-head">
                              <div className="inventory-warehouse-card-head-main">
                                <div className="inventory-warehouse-icon-badge">
                                  <WarehouseGlyph size={20} />
                                </div>
                                <div className="inventory-warehouse-heading-block">
                                  <h3 className="inventory-warehouse-title">
                                    {w.name}
                                  </h3>
                                  <div className="inventory-warehouse-code">
                                    {w.code}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="inventory-warehouse-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLocationId(null);
                                  setLocationForm({
                                    warehouse_id: w.id,
                                    name: "",
                                    code: "",
                                    is_primary: false,
                                    is_scrap: false,
                                  });
                                  setShowLocationModal(true);
                                }}
                                title={`Add location to ${w.name}`}
                                aria-label={`Add location to ${w.name}`}
                              >
                                <Plus size={16} />
                              </button>
                            </div>

                            {w.address && (
                              <div className="inventory-warehouse-address">
                                {w.address}
                              </div>
                            )}

                            <div className="inventory-warehouse-stats-grid">
                              <div className="inventory-warehouse-stat-card">
                                <div className="inventory-warehouse-stat-icon">
                                  <LayoutGrid size={16} />
                                </div>
                                <div className="inventory-warehouse-stat-label">
                                  Locations
                                </div>
                                <div className="inventory-warehouse-stat-value">
                                  {locs.length}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="inventory-warehouse-stat-card inventory-warehouse-stat-card-clickable"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openWarehouseProducts(w.id);
                                }}
                                title={`View items in ${w.name}`}
                              >
                                <div className="inventory-warehouse-stat-icon">
                                  <Package size={16} />
                                </div>
                                <div className="inventory-warehouse-stat-label">
                                  Items
                                </div>
                                <div className="inventory-warehouse-stat-value">
                                  {totalItems.toLocaleString()}
                                </div>
                              </button>
                              <div className="inventory-warehouse-stat-card">
                                <div className="inventory-warehouse-stat-icon">
                                  <DollarSign size={16} />
                                </div>
                                <div className="inventory-warehouse-stat-label">
                                  Value
                                </div>
                                <div className="inventory-warehouse-stat-value">
                                  $
                                  {totalValue.toLocaleString(undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="inventory-warehouse-locations">
                              {/* <div className="inventory-warehouse-locations-label">
                                Location
                              </div> */}
                              <div className="inventory-warehouse-locations-list">
                                {locs.slice(0, 5).map((l) => (
                                  <button
                                    key={l.id}
                                    type="button"
                                    className={`o-tag inventory-location-chip-btn ${
                                      l.is_primary
                                        ? "o-tag-done"
                                        : "o-tag-draft"
                                    }`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openLocationProducts(w.id, l.id);
                                    }}
                                    title={`View items in ${w.name} / ${l.name}`}
                                  >
                                    {l.name}
                                  </button>
                                ))}
                                {locs.length > 5 && (
                                  <span className="o-tag o-tag-draft">
                                    +{locs.length - 5} more
                                  </span>
                                )}
                                {locs.length === 0 && (
                                  <span className="inventory-warehouse-no-locations">
                                    No locations
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {warehouses.length === 0 && (
                        <div
                          className="inventory-warehouse-empty"
                          style={{
                            gridColumn: "1 / -1",
                            textAlign: "center",
                            padding: 60,
                          }}
                        >
                          <div className="inventory-empty-icon">
                            <WarehouseGlyph size={24} />
                          </div>
                          <h3 className="inventory-warehouse-empty-title">
                            No Warehouses Yet
                          </h3>
                          <p className="inventory-warehouse-empty-text">
                            Create your first warehouse to start managing
                            inventory
                          </p>
                          <button
                            className="o-btn o-btn-primary"
                            onClick={startNewWarehouse}
                          >
                            + Create Warehouse
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ============= WAREHOUSE FORM ============= */}
              {mainView === "warehouses" && subView === "form" && (
                <div className="o-main inventory-view-main">
                  <div className="o-form-view inventory-form-panel inventory-warehouse-form">
                    <div className="o-form-sheet">
                      <div className="inventory-warehouse-form-shell">
                        <section className="inventory-warehouse-form-card">
                          <div className="inventory-warehouse-form-head">
                            <div className="inventory-warehouse-hero-icon">
                              <WarehouseGlyph size={24} />
                            </div>
                            <div className="inventory-warehouse-form-main">
                              <div className="inventory-warehouse-form-eyebrow">
                                Warehouse
                              </div>
                              <input
                                type="text"
                                className="o-form-input inventory-warehouse-name-input"
                                placeholder="Warehouse Name"
                                value={warehouseForm.name}
                                onChange={(e) =>
                                  setWarehouseForm({
                                    ...warehouseForm,
                                    name: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="inventory-warehouse-form-metrics">
                            <div className="inventory-warehouse-form-metric">
                              <span className="inventory-warehouse-form-metric-label">
                                Total Locations
                              </span>
                              <strong className="inventory-warehouse-form-metric-value">
                                {selectedWarehouseId
                                  ? warehouseLocations(selectedWarehouseId)
                                      .length
                                  : 0}
                              </strong>
                            </div>
                            <div className="inventory-warehouse-form-metric">
                              <span className="inventory-warehouse-form-metric-label">
                                Primary Locations
                              </span>
                              <strong className="inventory-warehouse-form-metric-value">
                                {selectedWarehouseId
                                  ? warehouseLocations(
                                      selectedWarehouseId,
                                    ).filter((location) => location.is_primary)
                                      .length
                                  : 0}
                              </strong>
                            </div>
                            <div className="inventory-warehouse-form-metric">
                              <span className="inventory-warehouse-form-metric-label">
                                Status
                              </span>
                              <strong className="inventory-warehouse-form-metric-value">
                                {isNew ? "Draft" : "Active"}
                              </strong>
                            </div>
                          </div>

                          <div className="inventory-warehouse-form-fields">
                            <div className="o-form-group">
                              <label className="o-form-label">Short Code</label>
                              <div className="o-form-field">
                                <input
                                  type="text"
                                  className="o-form-input inventory-warehouse-code-input"
                                  value={warehouseForm.code}
                                  onChange={(e) =>
                                    setWarehouseForm({
                                      ...warehouseForm,
                                      code: e.target.value.toUpperCase(),
                                    })
                                  }
                                  placeholder="e.g., WH01"
                                />
                              </div>
                            </div>

                            <div className="o-form-group">
                              <label className="o-form-label">Address</label>
                              <div className="o-form-field inventory-field-full">
                                <textarea
                                  className="o-form-textarea"
                                  value={warehouseForm.address}
                                  onChange={(e) =>
                                    setWarehouseForm({
                                      ...warehouseForm,
                                      address: e.target.value,
                                    })
                                  }
                                  rows={3}
                                  placeholder="Warehouse address..."
                                />
                              </div>
                            </div>
                          </div>
                        </section>

                        {selectedWarehouseId && !isNew && (
                          <section className="inventory-warehouse-locations-panel">
                            <div className="inventory-warehouse-section-header">
                              <div className="inventory-warehouse-section-title-wrap">
                                <span className="inventory-warehouse-section-icon">
                                  <LayoutGrid size={18} />
                                </span>
                                <div>
                                  <h3 className="inventory-warehouse-section-title">
                                    Locations
                                  </h3>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="o-btn o-btn-secondary inventory-warehouse-add-location-btn"
                                onClick={() => {
                                  setSelectedLocationId(null);
                                  setLocationForm({
                                    warehouse_id: selectedWarehouseId,
                                    name: "",
                                    code: "",
                                    is_primary: false,
                                    is_scrap: false,
                                  });
                                  setShowLocationModal(true);
                                }}
                              >
                                <Plus size={16} />
                                Add Location
                              </button>
                            </div>

                            <div className="inventory-warehouse-locations-table-wrap">
                              <table className="o-list-table inventory-warehouse-locations-table">
                                <thead>
                                  <tr>
                                    <th>Name</th>
                                    <th>Code</th>
                                    <th>Type</th>
                                    <th>Primary</th>
                                    <th className="inventory-col-actions">
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {warehouseLocations(selectedWarehouseId).map(
                                    (l) => (
                                      <tr key={l.id}>
                                        <td>{l.name}</td>
                                        <td>{l.code}</td>
                                        <td>
                                          {l.is_scrap ? (
                                            <span className="inventory-location-scrap-badge">
                                              <TriangleAlert size={14} />
                                              Scrap
                                            </span>
                                          ) : (
                                            <span className="inventory-location-stock-badge">
                                              <Package size={14} />
                                              Stock
                                            </span>
                                          )}
                                        </td>
                                        <td>
                                          {l.is_primary ? (
                                            <span className="inventory-location-primary-badge">
                                              <Check size={14} />
                                              Primary
                                            </span>
                                          ) : (
                                            <span className="inventory-location-secondary-text">
                                              Secondary
                                            </span>
                                          )}
                                        </td>
                                        <td>
                                          <div className="inventory-location-actions">
                                            <button
                                              type="button"
                                              className="inventory-location-action-btn"
                                              onClick={() =>
                                                openLocationModal(l)
                                              }
                                              title="Edit location"
                                              aria-label="Edit location"
                                            >
                                              <PenLine size={15} />
                                            </button>
                                            <button
                                              type="button"
                                              className="inventory-location-action-btn inventory-location-action-btn-danger"
                                              onClick={() =>
                                                deleteLocation(l.id)
                                              }
                                              title="Delete location"
                                              aria-label="Delete location"
                                            >
                                              <Trash2 size={15} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                  {warehouseLocations(selectedWarehouseId)
                                    .length === 0 && (
                                    <tr>
                                      <td
                                        colSpan={5}
                                        className="inventory-empty-row inventory-muted-note"
                                      >
                                        No locations yet
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ============= OPERATIONS ============= */}
              {mainView === "operations" && subView === "list" && (
                <div className="o-main inventory-view-main">
                  {operationsTab === "moves" && (
                    <div className="o-list-view inventory-table-panel">
                      <div className="inventory-move-list-toolbar">
                        {/* <div className="inventory-move-filter-chips">
                          {[
                            { value: "all", label: "All" },
                            { value: "in", label: "Receipts" },
                            { value: "out", label: "Deliveries" },
                            { value: "internal", label: "Transfers" },
                            { value: "adjustment", label: "Adjustments" },
                          ].map((entry) => (
                            <button
                              key={entry.value}
                              type="button"
                              className={`inventory-move-chip ${
                                filterMoveType === entry.value ? "active" : ""
                              }`}
                              onClick={() => setFilterMoveType(entry.value)}
                            >
                              {entry.label}
                            </button>
                          ))}
                        </div> */}
                        {/* <div className="inventory-muted-note">
                          {filteredMoves.length} move
                          {filteredMoves.length === 1 ? "" : "s"}
                        </div> */}
                      </div>
                      <table className="o-list-table">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Date</th>
                            <th>Product</th>
                            <th>Type</th>
                            <th>Warehouse</th>
                            <th>Quantity</th>
                            <th className="text-end">Unit Cost</th>
                            <th className="text-end">Total</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMoves.map((m) => {
                            const product = products.find(
                              (p) => p.id === m.product_id,
                            );
                            const warehouse = warehouses.find(
                              (w) => w.id === m.warehouse_id,
                            );
                            const isReturned = isRefundReturnMove(m);
                            return (
                              <tr
                                key={m.id}
                                onDoubleClick={() => openMove(m)}
                                className="inventory-table-clickable"
                              >
                                <td>
                                  <span
                                    className="inventory-link-cell"
                                    onClick={() => openMove(m)}
                                  >
                                    {m.reference ||
                                      `WH/MOV/${String(m.id).padStart(5, "0")}`}
                                  </span>
                                </td>
                                <td>{formatStockMoveDate(m)}</td>
                                <td>
                                  <div>
                                    <span
                                      className="inventory-link-cell"
                                      onClick={() => openMove(m)}
                                    >
                                      {product?.name || "-"}
                                    </span>
                                    {isReturned && m.source_document && (
                                      <div className="inventory-subtext">
                                        Returned from {m.source_document}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className={`o-tag o-tag-${isReturned ? "in" : m.move_type}`}
                                  >
                                    {getMoveTypeLabel(m)}
                                  </span>
                                </td>
                                <td>
                                  {warehouse?.name || "-"}
                                  {isReturned && (
                                    <div className="inventory-subtext">
                                      POS customer return
                                    </div>
                                  )}
                                </td>
                                <td className="inventory-strong-cell">
                                  {m.quantity}{" "}
                                  {(product?.uom === "PCS"
                                    ? "Units"
                                    : product?.uom) || "Units"}
                                </td>
                                <td className="o-monetary">
                                  ${m.unit_cost.toFixed(2)}
                                </td>
                                <td className="o-monetary inventory-strong-cell">
                                  ${m.total_cost.toFixed(2)}
                                </td>
                                <td>
                                  <span className={`o-tag o-tag-${m.state}`}>
                                    {
                                      STATES.find((s) => s.value === m.state)
                                        ?.label
                                    }
                                  </span>
                                </td>
                                <td>
                                  <div className="o-quick-actions inventory-row-actions">
                                    <button
                                      className="o-btn o-btn-secondary o-btn-icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void printMovePdf(m);
                                      }}
                                      title="Print PDF"
                                    >
                                      <Printer size={14} />
                                    </button>
                                    {m.state === "done" && (
                                      <button
                                        className="o-btn o-btn-secondary o-btn-icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/accounting?section=journal_entries&reference=${encodeURIComponent(`STK/${m.id}`)}`);
                                        }}
                                        title="Journal Entry"
                                      >
                                        <FileText size={14} />
                                      </button>
                                    )}
                                    {m.state === "draft" && (
                                      <>
                                        <button
                                          className="o-btn o-btn-success o-btn-icon"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            confirmMove(m.id);
                                          }}
                                          title="Validate"
                                        >
                                          <Check size={14} />
                                        </button>
                                        <button
                                          className="o-btn o-btn-danger o-btn-icon"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            cancelMove(m.id);
                                          }}
                                          title="Cancel"
                                        >
                                          <X size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredMoves.length === 0 && (
                        <div className="inventory-empty-row">
                          <div className="inventory-muted-note inventory-empty-note">
                            No stock moves found
                          </div>
                          <button
                            className="o-btn o-btn-primary"
                            onClick={() => startNewMove("in")}
                          >
                            + Create Stock Move
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {operationsTab === "quants" && (
                    <div className="o-list-view inventory-table-panel">
                      <table className="o-list-table">
                        <thead>
                          <tr>
                            <th>Location</th>
                            <th>Product</th>
                            <th>Reference</th>
                            <th>On Hand Qty</th>
                            <th>Reserved Qty</th>
                            <th>Unit</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedStockOnHandRows.map((group) => {
                            const isExpanded = expandedQuantGroupKeys.has(
                              group.key,
                            );
                            const totalPages = Math.max(
                              1,
                              Math.ceil(group.rows.length / quantGroupPageSize),
                            );
                            const currentPage = Math.min(
                              quantGroupPages[group.key] ?? 1,
                              totalPages,
                            );
                            const fromItem =
                              group.rows.length === 0
                                ? 0
                                : (currentPage - 1) * quantGroupPageSize + 1;
                            const toItem = Math.min(
                              group.rows.length,
                              currentPage * quantGroupPageSize,
                            );
                            const visibleRows = group.rows.slice(
                              (currentPage - 1) * quantGroupPageSize,
                              currentPage * quantGroupPageSize,
                            );

                            return (
                              <Fragment key={`group-body-${group.key}`}>
                                <tr className="inventory-table-clickable">
                                  <td>
                                    <button
                                      type="button"
                                      className="inventory-quant-group-toggle"
                                      onClick={() =>
                                        toggleQuantGroup(group.key)
                                      }
                                    >
                                      <span
                                        className={`inventory-quant-group-chevron ${isExpanded ? "is-open" : ""}`}
                                      >
                                        <ChevronDown size={14} />
                                      </span>
                                      <span className="inventory-strong-cell">
                                        {group.locationLabel} ({group.rowCount})
                                      </span>
                                    </button>
                                  </td>
                                  <td />
                                  <td>
                                    {group.rows.length > 0 && (
                                      <div className="inventory-quant-group-pager">
                                        <span>
                                          {fromItem}-{toItem} /{" "}
                                          {group.rows.length}
                                        </span>
                                        <button
                                          type="button"
                                          className="inventory-quant-group-page-btn"
                                          disabled={currentPage <= 1}
                                          onClick={() =>
                                            changeQuantGroupPage(
                                              group.key,
                                              currentPage - 1,
                                            )
                                          }
                                        >
                                          <ChevronLeft size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          className="inventory-quant-group-page-btn"
                                          disabled={currentPage >= totalPages}
                                          onClick={() =>
                                            changeQuantGroupPage(
                                              group.key,
                                              currentPage + 1,
                                            )
                                          }
                                        >
                                          <ChevronRight size={14} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="inventory-strong-cell">
                                    {group.onHand.toFixed(2)}
                                  </td>
                                  <td
                                    className={
                                      group.reserved > 0
                                        ? "inventory-reserved-value"
                                        : ""
                                    }
                                  >
                                    {group.reserved.toFixed(2)}
                                  </td>
                                  <td />
                                  <td />
                                </tr>
                                {isExpanded &&
                                  visibleRows.map((row) => {
                                    const product = row.product;
                                    return (
                                      <tr
                                        key={`quant-${row.quant.id}`}
                                        className="inventory-quant-child-row"
                                      >
                                        <td>{group.locationLabel}</td>
                                        <td className="inventory-strong-cell">
                                          {product?.name || "-"}
                                        </td>
                                        <td>{product?.reference || "-"}</td>
                                        <td>
                                          {product ? (
                                            <button
                                              type="button"
                                              className="o-btn o-btn-link inventory-qty-btn"
                                              onClick={() =>
                                                openOnHandAdjustment(
                                                  product,
                                                  row.quant.warehouse_id,
                                                  row.quant.location_id,
                                                )
                                              }
                                            >
                                              {row.quant.quantity.toFixed(2)}
                                            </button>
                                          ) : (
                                            <span className="inventory-strong-cell">
                                              {row.quant.quantity.toFixed(2)}
                                            </span>
                                          )}
                                        </td>
                                        <td
                                          className={
                                            row.quant.reserved_quantity > 0
                                              ? "inventory-reserved-value"
                                              : ""
                                          }
                                        >
                                          {row.quant.reserved_quantity.toFixed(
                                            2,
                                          )}
                                        </td>
                                        <td>{product?.uom || "-"}</td>
                                        <td>
                                          <div className="inventory-quant-actions">
                                            {product && (
                                              <>
                                                <button
                                                  type="button"
                                                  className="o-btn o-btn-link"
                                                  onClick={() =>
                                                    openProduct(product)
                                                  }
                                                >
                                                  History
                                                </button>
                                                <button
                                                  type="button"
                                                  className="o-btn o-btn-link"
                                                  onClick={() =>
                                                    openOnHandAdjustment(
                                                      product,
                                                      row.quant.warehouse_id,
                                                      row.quant.location_id,
                                                    )
                                                  }
                                                >
                                                  Replenishment
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </Fragment>
                            );
                          })}
                          {groupedStockOnHandRows.length === 0 && (
                            <tr>
                              <td
                                colSpan={7}
                                className="inventory-empty-row inventory-muted-note"
                              >
                                No stock on hand. Validate stock moves to update
                                quantities.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {operationsTab === "adjustments" && (
                    <div className="o-list-view inventory-table-panel">
                      <table className="o-list-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Warehouse</th>
                            <th>Location</th>
                            <th className="text-end">On Hand</th>
                            <th className="text-end">Counted</th>
                            <th className="text-end">Difference</th>
                            <th className="text-end">Unit Cost</th>
                            <th className="text-end">New Value</th>
                            <th style={{ width: 110 }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newCountLines.map((line) => {
                            const lineLocations = locations.filter(
                              (loc) => loc.warehouse_id === line.warehouse_id,
                            );
                            return (
                              <tr
                                key={line.id}
                                className="inventory-adjustment-row-changed"
                              >
                                {/* Product */}
                                <td>
                                  <select
                                    className="o-form-select"
                                    value={line.product_id ?? ""}
                                    onChange={(e) =>
                                      setNewCountLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id
                                            ? {
                                                ...l,
                                                product_id: e.target.value
                                                  ? Number(e.target.value)
                                                  : null,
                                              }
                                            : l,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">Select product...</option>
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* Warehouse */}
                                <td>
                                  <select
                                    className="o-form-select"
                                    value={line.warehouse_id ?? ""}
                                    onChange={(e) =>
                                      setNewCountLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id
                                            ? {
                                                ...l,
                                                warehouse_id: e.target.value
                                                  ? Number(e.target.value)
                                                  : null,
                                                location_id: null,
                                              }
                                            : l,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">
                                      Select warehouse...
                                    </option>
                                    {warehouses.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* Location */}
                                <td>
                                  <select
                                    className="o-form-select"
                                    value={line.location_id ?? ""}
                                    disabled={!line.warehouse_id}
                                    onChange={(e) =>
                                      setNewCountLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id
                                            ? {
                                                ...l,
                                                location_id: e.target.value
                                                  ? Number(e.target.value)
                                                  : null,
                                              }
                                            : l,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">Select location...</option>
                                    {lineLocations.map((loc) => (
                                      <option key={loc.id} value={loc.id}>
                                        {loc.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* On Hand — blank for new lines */}
                                <td className="text-end">—</td>

                                {/* Counted quantity */}
                                <td className="text-end">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="inventory-counted-input"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      setNewCountLines((prev) =>
                                        prev.map((l) =>
                                          l.id === line.id
                                            ? { ...l, quantity: e.target.value }
                                            : l,
                                        ),
                                      )
                                    }
                                  />
                                </td>

                                {/* Difference, Unit Cost, New Value — blank for new lines */}
                                <td className="text-end">—</td>
                                <td className="text-end">—</td>
                                <td className="text-end">—</td>

                                {/* Action */}
                                <td>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      alignItems: "center",
                                    }}
                                  >
                                    <button
                                      className="o-btn o-btn-primary"
                                      onClick={() =>
                                        void applyNewCountLine(line)
                                      }
                                      disabled={
                                        applyingAdjustments || !line.product_id
                                      }
                                    >
                                      Apply
                                    </button>
                                    <button
                                      className="o-btn o-btn-link"
                                      onClick={() =>
                                        removeNewCountLine(line.id)
                                      }
                                      title="Remove line"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {adjustmentRows.map((row) => {
                            const hasDelta = row.changed;
                            return (
                              <tr
                                key={row.quantId}
                                className={
                                  hasDelta
                                    ? "inventory-adjustment-row-changed"
                                    : ""
                                }
                              >
                                <td className="inventory-strong-cell">
                                  {row.productName}
                                </td>
                                <td>{row.warehouseName}</td>
                                <td>{row.locationName}</td>
                                <td className="text-end">
                                  {row.onHand} {row.uom}
                                </td>
                                <td className="text-end">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={row.countedText}
                                    className={`inventory-counted-input ${!row.isValid ? "invalid" : ""}`}
                                    onChange={(e) =>
                                      updateCountedQuantity(
                                        row.quantId,
                                        e.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td
                                  className={`text-end ${row.difference > 0 ? "inventory-diff-positive" : row.difference < 0 ? "inventory-diff-negative" : ""}`}
                                >
                                  {row.isValid
                                    ? row.difference.toFixed(2)
                                    : "-"}
                                </td>
                                <td className="o-monetary text-end">
                                  ${row.unitCost.toFixed(2)}
                                </td>
                                <td className="o-monetary text-end">
                                  {row.isValid
                                    ? `$${(row.counted * row.unitCost).toFixed(2)}`
                                    : "-"}
                                </td>
                                <td>
                                  {row.isValid && row.changed ? (
                                    <button
                                      className="o-btn o-btn-primary"
                                      onClick={() =>
                                        void applyInventoryAdjustments([
                                          row.quantId,
                                        ])
                                      }
                                      disabled={applyingAdjustments}
                                    >
                                      Apply
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}

                          {adjustmentRows.length === 0 && (
                            <tr>
                              <td
                                colSpan={9}
                                className="inventory-empty-row inventory-muted-note"
                              >
                                No adjustment rows found for this filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ============= STOCK MOVE FORM ============= */}
              {mainView === "operations" && subView === "form" && (
                <div
                  className="o-main inventory-view-main"
                  style={{ width: "100%" }}
                >
                  <div className="o-form-view inventory-form-panel inventory-move-form">
                    <button
                      className="o-btn o-btn-link inventory-move-back-link"
                      onClick={goBack}
                    >
                      ← Back to List
                    </button>
                    <div className="inventory-move-header">
                      <h2 className="inventory-move-title">
                        {isNew
                          ? "New Stock Move"
                          : selectedMove?.reference ||
                            `Move #${selectedMoveId}`}
                      </h2>
                      <div className="inventory-move-header-actions">
                        <button
                          className="o-btn o-btn-primary"
                          onClick={saveMove}
                          disabled={saving}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="o-btn o-btn-secondary"
                          onClick={goBack}
                        >
                          Discard
                        </button>
                        {!isNew && selectedMoveId && (
                          <button
                            className="o-btn o-btn-danger"
                            onClick={() => deleteMove(selectedMoveId)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          className="o-btn o-btn-secondary"
                          onClick={() => void printMovePdf()}
                        >
                          <Printer size={14} />
                          <span>Print PDF</span>
                        </button>
                        {!isNew && selectedMoveId && (
                          <button
                            className="o-btn o-btn-secondary"
                            onClick={() => setJournalPreviewOpen(true)}
                          >
                            Journal Preview
                          </button>
                        )}
                      </div>
                    </div>
                    {/* <div className="inventory-form-actions">
                      {selectedMove && !isNew && (
                        <div className="o-statusbar inventory-statusbar">
                          {STATES.map((s, i) => (
                            <div
                              key={s.value}
                              className={`o-statusbar-item ${
                                selectedMove.state === s.value
                                  ? "active"
                                  : STATES.findIndex(
                                        (st) => st.value === selectedMove.state,
                                      ) > i
                                    ? "done"
                                    : ""
                              }`}
                            >
                              {s.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div> */}

                    <div className="o-form-sheet">
                      <div className="inventory-two-col-grid">
                        <div className="inventory-move-section-head">
                          <span className="inventory-move-section-icon">
                            <Package size={18} />
                          </span>
                          <span>Move Information</span>
                        </div>
                        <div className="inventory-move-fields">
                          <div className="o-form-group">
                            <label className="o-form-label">
                              Operation Type
                            </label>
                            <div className="o-form-field">
                              <select
                                className="o-form-select"
                                value={moveForm.move_type}
                                onChange={(e) =>
                                  setMoveForm({
                                    ...moveForm,
                                    move_type: e.target.value,
                                  })
                                }
                                disabled={isMoveReadonly}
                              >
                                {MOVE_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="o-form-group">
                            <ValidatedField
                              label="Warehouse"
                              className="o-form-field"
                              isInvalid={invalidMoveFields.includes(
                                "warehouse",
                              )}
                            >
                              <select
                                className="o-form-select"
                                value={moveForm.warehouse_id ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value
                                    ? Number(e.target.value)
                                    : null;
                                  setMoveForm({
                                    ...moveForm,
                                    warehouse_id: value,
                                    location_id: null,
                                  });
                                  clearInvalidMoveField("warehouse", value);
                                }}
                                disabled={isMoveReadonly}
                              >
                                <option value="">Select a warehouse...</option>
                                {warehouses.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}
                                  </option>
                                ))}
                              </select>
                            </ValidatedField>
                          </div>

                          <div className="o-form-group">
                            <ValidatedField
                              label="Location"
                              className="o-form-field"
                              isInvalid={invalidMoveFields.includes("location")}
                            >
                              <select
                                className="o-form-select"
                                value={moveForm.location_id ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value
                                    ? Number(e.target.value)
                                    : null;
                                  setMoveForm({
                                    ...moveForm,
                                    location_id: value,
                                  });
                                  clearInvalidMoveField("location", value);
                                }}
                                disabled={isMoveReadonly}
                              >
                                <option value="">Select a location...</option>
                                {locations
                                  .filter(
                                    (l) =>
                                      !moveForm.warehouse_id ||
                                      l.warehouse_id === moveForm.warehouse_id,
                                  )
                                  .map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.name}
                                    </option>
                                  ))}
                              </select>
                            </ValidatedField>
                          </div>
                          <div className="o-form-group">
                            <label className="o-form-label">Reference</label>
                            <div className="o-form-field">
                              <input
                                type="text"
                                className="o-form-input"
                                value={moveForm.reference}
                                onChange={(e) =>
                                  setMoveForm({
                                    ...moveForm,
                                    reference: e.target.value,
                                  })
                                }
                                placeholder="e.g., WH/IN/00001"
                                disabled={isMoveReadonly}
                              />
                            </div>
                          </div>

                          <div className="o-form-group">
                            <label className="o-form-label">
                              Source Document
                            </label>
                            <div className="o-form-field">
                              <input
                                type="text"
                                className="o-form-input"
                                value={moveForm.source_document}
                                onChange={(e) =>
                                  setMoveForm({
                                    ...moveForm,
                                    source_document: e.target.value,
                                  })
                                }
                                placeholder="e.g., PO-00001"
                                disabled={isMoveReadonly}
                              />
                            </div>
                          </div>

                          <div className="inventory-move-summary-inline">
                            <div className="inventory-move-summary-inline-item">
                              <span>Lines:</span>
                              <strong>{moveLines.length}</strong>
                            </div>
                            <div className="inventory-move-summary-inline-item">
                              <span>Total Qty:</span>
                              <strong>
                                {moveLinesTotals.quantity.toFixed(2)}
                              </strong>
                            </div>
                            <div className="inventory-move-summary-inline-item">
                              <span>Total Value:</span>
                              <strong>
                                ${moveLinesTotals.total.toFixed(2)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="inventory-move-lines-panel">
                        <div className="inventory-move-lines-header">
                          <span>
                            <span className="inventory-move-section-icon">
                              <Boxes size={18} />
                            </span>
                            Product Lines
                          </span>
                          {isNew && !isMoveReadonly && (
                            <button
                              type="button"
                              className="o-btn o-btn-primary inventory-inline-action-btn"
                              onClick={addMoveLine}
                            >
                              <Plus size={14} />
                              <span>Add Line</span>
                            </button>
                          )}
                        </div>
                        <div className="o-inline-table inventory-move-lines-table-wrap">
                          <table className="inventory-move-lines-table">
                            <thead>
                              <tr>
                                <th className="inventory-move-col-line">#</th>
                                <th>Product</th>
                                <th className="text-end inventory-move-col-qty">
                                  Quantity
                                </th>
                                <th className="text-end inventory-move-col-cost">
                                  Unit Cost
                                </th>
                                <th className="text-end inventory-move-col-total">
                                  Line Total
                                </th>
                                <th className="inventory-move-col-actions">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {moveLines.map((line, index) => {
                                const product = products.find(
                                  (p) => p.id === line.product_id,
                                );
                                const quantity = Number(line.quantity) || 0;
                                const unitCost = Number(line.unit_cost) || 0;
                                const lineTotal = quantity * unitCost;
                                return (
                                  <tr key={line.line_id}>
                                    <td>{index + 1}</td>
                                    <td>
                                      <select
                                        className="o-form-select"
                                        value={line.product_id ?? ""}
                                        onChange={(e) => {
                                          const productId = e.target.value
                                            ? Number(e.target.value)
                                            : null;
                                          const selectedProductLine =
                                            products.find(
                                              (p) => p.id === productId,
                                            );
                                          updateMoveLine(line.line_id, {
                                            product_id: productId,
                                            unit_cost:
                                              selectedProductLine?.purchase_cost ??
                                              0,
                                          });
                                        }}
                                        disabled={isMoveReadonly}
                                      >
                                        <option value="">
                                          Select product...
                                        </option>
                                        {products.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="text-end">
                                      <input
                                        type="number"
                                        className="o-form-input inventory-move-line-number"
                                        min="0"
                                        step="0.01"
                                        value={line.quantity}
                                        onChange={(e) =>
                                          updateMoveLine(line.line_id, {
                                            quantity: Number(e.target.value),
                                          })
                                        }
                                        disabled={isMoveReadonly}
                                      />
                                    </td>
                                    <td className="text-end">
                                      <input
                                        type="number"
                                        className="o-form-input inventory-move-line-number"
                                        min="0"
                                        step="0.01"
                                        value={line.unit_cost}
                                        onChange={(e) =>
                                          updateMoveLine(line.line_id, {
                                            unit_cost: Number(e.target.value),
                                          })
                                        }
                                        disabled={isMoveReadonly}
                                      />
                                    </td>
                                    <td className="text-end inventory-line-total">
                                      ${lineTotal.toFixed(2)}
                                      <div className="inventory-subtext">
                                        {product?.uom || "Units"}
                                      </div>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="o-btn o-btn-danger o-btn-icon"
                                        onClick={() =>
                                          removeMoveLine(line.line_id)
                                        }
                                        disabled={
                                          isMoveReadonly ||
                                          !isNew ||
                                          moveLines.length <= 1
                                        }
                                        title="Remove line"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ============= MODALS ============= */}

            {/* Category Modal */}
            {showCategoryModal && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "var(--white-500)",
                    borderRadius: 8,
                    padding: 24,
                    width: 400,
                  }}
                >
                  <h3 style={{ margin: "0 0 16px 0" }}>
                    {selectedCategoryId ? "Edit Category" : "New Category"}
                  </h3>
                  <div className="o-form-group">
                    <ValidatedField
                      label="Name"
                      className="o-form-field"
                      isInvalid={invalidCategoryFields.includes(
                        "category_name",
                      )}
                    >
                      <input
                        type="text"
                        className="o-form-input"
                        value={categoryForm.name}
                        onChange={(e) => {
                          const { value } = e.target;
                          setCategoryForm({
                            ...categoryForm,
                            name: value,
                          });
                          clearInvalidCategoryField("category_name", value);
                        }}
                        autoFocus
                      />
                    </ValidatedField>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      marginTop: 24,
                    }}
                  >
                    <button
                      type="button"
                      className="o-btn o-btn-secondary"
                      onClick={() => {
                        setShowCategoryModal(false);
                        setSelectedCategoryId(null);
                        setInvalidCategoryFields([]);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="o-btn o-btn-primary"
                      onClick={saveCategory}
                      disabled={saving}
                    >
                      {saving
                        ? "Saving..."
                        : selectedCategoryId
                          ? "Save"
                          : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {showImportExportModal && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "var(--white-500)",
                    borderRadius: 10,
                    padding: 24,
                    width: 360,
                    textAlign: "center",
                  }}
                >
                  <h3 style={{ margin: "0 0 16px" }}>
                    {importExportTarget === "products"
                      ? "Import or Export"
                      : "Export Stock Moves"}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    {importExportTarget === "products" && (
                      <button
                        className="o-btn o-btn-secondary"
                        onClick={() => {
                          productImportInputRef.current?.click();
                          setShowImportExportModal(false);
                        }}
                      >
                        <Upload size={14} />
                        <span>Import products</span>
                      </button>
                    )}
                    <button
                      className="o-btn o-btn-secondary"
                      onClick={() => {
                        if (importExportTarget === "products") {
                          exportProducts("csv");
                        } else {
                          exportStockMoves("csv");
                        }
                        setShowImportExportModal(false);
                      }}
                    >
                      <Download size={14} />
                      <span>Export CSV</span>
                    </button>
                    <button
                      className="o-btn o-btn-secondary"
                      onClick={() => {
                        if (importExportTarget === "products") {
                          exportProducts("xlsx");
                        } else {
                          exportStockMoves("xlsx");
                        }
                        setShowImportExportModal(false);
                      }}
                    >
                      <Download size={14} />
                      <span>Export XLSX</span>
                    </button>
                  </div>
                  <button
                    className="o-btn o-btn-link"
                    onClick={() => setShowImportExportModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Location Modal */}
            {showLocationModal && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "var(--white-500)",
                    borderRadius: 8,
                    padding: 24,
                    width: 400,
                  }}
                >
                  <h3 style={{ margin: "0 0 16px 0" }}>
                    {selectedLocationId ? "Edit Location" : "New Location"}
                  </h3>
                  <div className="o-form-group">
                    <ValidatedField
                      label="Warehouse"
                      className="o-form-field"
                      isInvalid={invalidLocationFields.includes("warehouse")}
                    >
                      <select
                        className="o-form-select"
                        value={locationForm.warehouse_id ?? ""}
                        onChange={(e) => {
                          const value = e.target.value
                            ? Number(e.target.value)
                            : null;
                          setLocationForm({
                            ...locationForm,
                            warehouse_id: value,
                          });
                          clearInvalidLocationField("warehouse", value);
                        }}
                        disabled={!!selectedLocationId}
                      >
                        <option value="">Select warehouse...</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </ValidatedField>
                  </div>
                  <div className="o-form-group">
                    <ValidatedField
                      label="Name"
                      className="o-form-field"
                      isInvalid={invalidLocationFields.includes(
                        "location_name",
                      )}
                    >
                      <input
                        type="text"
                        className="o-form-input"
                        value={locationForm.name}
                        onChange={(e) => {
                          const { value } = e.target;
                          setLocationForm({
                            ...locationForm,
                            name: value,
                          });
                          clearInvalidLocationField("location_name", value);
                        }}
                        placeholder="e.g., Shelf A-1"
                      />
                    </ValidatedField>
                  </div>
                  <div className="o-form-group">
                    <label className="o-form-label">Code</label>
                    <div className="o-form-field">
                      <input
                        type="text"
                        className="o-form-input"
                        value={locationForm.code}
                        onChange={(e) =>
                          setLocationForm({
                            ...locationForm,
                            code: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </div>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      marginTop: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={locationForm.is_scrap}
                      onChange={(e) =>
                        setLocationForm({
                          ...locationForm,
                          is_scrap: e.target.checked,
                          is_primary: e.target.checked
                            ? false
                            : locationForm.is_primary,
                        })
                      }
                    />
                    Scrap Location
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      marginTop: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={locationForm.is_primary}
                      disabled={locationForm.is_scrap}
                      onChange={(e) =>
                        setLocationForm({
                          ...locationForm,
                          is_primary: e.target.checked,
                        })
                      }
                    />
                    Primary Location
                  </label>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      marginTop: 24,
                    }}
                  >
                    <button
                      className="o-btn o-btn-secondary"
                      onClick={() => {
                        setShowLocationModal(false);
                        setSelectedLocationId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="o-btn o-btn-primary"
                      onClick={saveLocation}
                      disabled={saving}
                    >
                      {saving
                        ? "Saving..."
                        : selectedLocationId
                          ? "Save"
                          : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <JournalEntryPreviewDrawer
              open={journalPreviewOpen}
              onClose={() => setJournalPreviewOpen(false)}
              sourceType="stock"
              sourceId={selectedMoveId}
            />
          </div>
        </div>
      </div>
    </>
  );
}
