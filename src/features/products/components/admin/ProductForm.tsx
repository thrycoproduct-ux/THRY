"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  AdminLoadingState,
  LoadingButtonLabel,
} from "@/components/admin/AdminLoadingState";
import { BoundedNumberInput } from "@/components/admin/BoundedNumberInput";
import { AdminSaveProgressOverlay } from "@/components/admin/AdminSaveProgressOverlay";
import BadgeSelectField from "@/features/cms/components/BadgeSelectField";
import ImagePreviewCard from "@/features/medias/components/ImagePreviewCard";
import UploadMediaContainer from "@/features/medias/components/UploadMediaContainer";
import {
  InsertProducts,
  SelectProducts,
  products,
} from "@/lib/supabase/schema";
import {
  DIGITAL_UPLOAD_LIMIT_MB,
  DIGITAL_ZIP_CONTENT_TYPE,
  assertDigitalUploadLimits,
  formatDigitalUploadNetworkError,
} from "@/lib/products/digital-product";
import { MAX_PRODUCT_IMAGES } from "@/lib/admin/product-gallery-shared";
import { X } from "lucide-react";
import {
  mergeUniqueFiles,
  prepareImageFilesForDirect,
  runBulkDraftUpload,
  type UploadFileFailure,
  type UploadProgressUpdate,
  UPLOAD_LIMIT_MB,
} from "@/lib/admin/client-image-upload";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import {
  normalizeProductFormPayload,
  productStorefrontVisibilitySummary,
} from "@/lib/admin/normalize-product-form-payload";
import { buildBulkSharedPayloadFromForm } from "@/lib/admin/normalize-bulk-product-shared";
import {
  getOriginalProductPrice,
  getSaleProductPrice,
  isProductDiscountActive,
} from "@/lib/products/discount";
import {
  DEFAULT_PRODUCT_OPTION_NAME,
  getMinSelectableOptionPrice,
  PRODUCT_OPTION_NAME_MAX,
  PRODUCT_OPTION_VALUE_MAX,
} from "@/lib/products/sizeConfig-shared";
import {
  DEFAULT_VARIANT_TYPE_NAMES,
  mergeVariantTypeNames,
} from "@/lib/products/variant-type-catalog-shared";
import { formatPrice } from "@/lib/utils";
import { ProductPriceDisplay } from "@/features/products/components/ProductPriceDisplay";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@urql/next";
import { createInsertSchema } from "drizzle-zod";
import Link from "next/link";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useForm } from "react-hook-form";
import { gql } from "urql";

type ProductsFormProps = {
  product?: SelectProducts;
  /** Extra gallery media ids (not including featured). Loaded on edit. */
  galleryMediaIds?: string[];
};

type BulkCreateMode = "single" | "bulk";

type CreatedDraftProduct = {
  id: string;
  productCode: string;
  name: string;
  slug: string;
};

const MAX_BULK_FILES = 50;
const BULK_SHARED_FIELDS = [
  "name",
  "description",
  "isDraft",
  "collectionId",
  "badge",
  "rating",
  "price",
  "stock",
  "discountEnabled",
  "discountPercent",
  "soldAsPack",
  "packSize",
] as const;

type ApiSettingRecord = {
  key: string;
  isEnabled: boolean;
  value: Record<string, unknown>;
} | null;

type IntegrationsPayload = {
  stockControl: ApiSettingRecord;
};

type SizeOptionForm = {
  value: string;
  qty: string;
  price: string;
};

type SizeGroupForm = {
  id: string;
  name: string;
  options: SizeOptionForm[];
};

type ProductSizeConfigForm = {
  enabled: boolean;
  groups: SizeGroupForm[];
};

function createGroupId() {
  return `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultSizeGroup(): SizeGroupForm {
  return {
    id: createGroupId(),
    name: DEFAULT_PRODUCT_OPTION_NAME,
    options: [
      { value: "36", qty: "1", price: "" },
      { value: "38", qty: "1", price: "" },
      { value: "40", qty: "1", price: "" },
      { value: "42", qty: "1", price: "" },
      { value: "44", qty: "1", price: "" },
    ],
  };
}

function createEmptyGroup(name = DEFAULT_PRODUCT_OPTION_NAME): SizeGroupForm {
  return {
    id: createGroupId(),
    name,
    options: [{ value: "", qty: "", price: "" }],
  };
}

const ADD_CUSTOM_VARIANT_VALUE = "__add_custom_variant__";
const ADD_TYPE_PREFIX = "__add_type__:";

function normalizeSizeQtyInput(raw: unknown) {
  const value = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizeSizePriceInput(raw: unknown): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function mapOptionsFromApi(rawOptions: unknown): SizeOptionForm[] {
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
    return [{ value: "", qty: "", price: "" }];
  }
  return rawOptions.map((item) => {
    const raw = item as Record<string, unknown>;
    const value = String(raw.value ?? raw.size ?? "")
      .trim()
      .slice(0, PRODUCT_OPTION_VALUE_MAX)
      .toUpperCase();
    const price =
      raw.price == null || String(raw.price).trim() === ""
        ? ""
        : String(raw.price);
    return {
      value,
      qty: String(raw.qty ?? ""),
      price,
    };
  });
}

function hasAnyGroupConfigured(groups: SizeGroupForm[]) {
  return groups.some((group) =>
    group.options.some((option) => {
      const value = String(option.value ?? "").trim();
      const qty = normalizeSizeQtyInput(option.qty);
      const price = normalizeSizePriceInput(option.price);
      return value.length > 0 || qty > 0 || price != null;
    }),
  );
}

type BulkSharedPayload = ReturnType<typeof buildBulkSharedPayloadFromForm>;

const productFormSchema = createInsertSchema(products)
  .omit({ slug: true })
  .extend({
    slug: z.string().optional(),
    description: z
      .string()
      .trim()
      .min(1, "Description is required.")
      .max(4000, "Description is too long."),
    name: z.string().trim().min(1, "Product name is required."),
    price: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z
        .string()
        .min(1, "Price is required.")
        .refine(
          (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
          "Enter a valid price.",
        ),
    ),
    rating: z.preprocess((value) => {
      if (value == null || String(value).trim() === "") return "4";
      return typeof value === "string" ? value.trim() : value;
    }, z.string().min(1)),
    collectionId: z
      .string({ required_error: "Catalog is required." })
      .trim()
      .min(1, "Catalog is required."),
    soldAsPack: z.coerce.boolean().default(false),
    isDigital: z.coerce.boolean().default(false),
    packSize: z.union([z.coerce.number(), z.null()]).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.soldAsPack) return;
    const packSize = Number(data.packSize);
    if (
      !Number.isFinite(packSize) ||
      !Number.isInteger(packSize) ||
      packSize < 2 ||
      packSize > 9999
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Pieces per set must be a whole number between 2 and 9999 when sold as a set/pack.",
        path: ["packSize"],
      });
    }
  });

export const ProductFormQuery = gql(/* GraphQL */ `
  query ProductFormQuery {
    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {
      __typename
      edges {
        node {
          id
          label
        }
      }
    }
  }
`);

const SINGLE_SAVE_STEPS = [
  { key: "product", message: "Saving product details..." },
  { key: "sizes", message: "Saving size options..." },
  { key: "storefront", message: "Updating website catalog..." },
] as const;

type SingleSaveStep = (typeof SINGLE_SAVE_STEPS)[number]["key"];

function ProductFrom({ product, galleryMediaIds = [] }: ProductsFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const [createMode, setCreateMode] = useState<BulkCreateMode>("single");
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [isProductImagesDialogOpen, setIsProductImagesDialogOpen] =
    useState(false);
  const [productImageMediaIds, setProductImageMediaIds] = useState<string[]>(
    () => {
      const featured = product?.featuredImageId
        ? [product.featuredImageId]
        : [];
      const gallery = galleryMediaIds.filter(
        (id) => id && id !== product?.featuredImageId,
      );
      return [...featured, ...gallery].slice(0, MAX_PRODUCT_IMAGES);
    },
  );
  const [bulkCreated, setBulkCreated] = useState<CreatedDraftProduct[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkFailures, setBulkFailures] = useState<UploadFileFailure[]>([]);
  const [bulkProgress, setBulkProgress] = useState<UploadProgressUpdate | null>(
    null,
  );
  const [bulkPhase, setBulkPhase] = useState<
    "idle" | "preparing" | "uploading" | "creating"
  >("idle");
  const [prepareProgress, setPrepareProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [singleSaveStep, setSingleSaveStep] = useState<SingleSaveStep | null>(
    null,
  );
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [stockControl, setStockControl] = useState({
    enabled: false,
    lowStockThreshold: 5,
  });
  const [sizeConfig, setSizeConfig] = useState<ProductSizeConfigForm>({
    enabled: false,
    groups: [createEmptyGroup()],
  });
  const [activeVariantGroupId, setActiveVariantGroupId] = useState<string>(
    () => sizeConfig.groups[0]?.id ?? "",
  );
  const [knownVariantTypes, setKnownVariantTypes] = useState<string[]>([
    ...DEFAULT_VARIANT_TYPE_NAMES,
  ]);
  const [customTypeDialogOpen, setCustomTypeDialogOpen] = useState(false);
  const [customTypeNameDraft, setCustomTypeNameDraft] = useState("");
  const [customTypeError, setCustomTypeError] = useState<string | null>(null);
  const [digitalFile, setDigitalFile] = useState<{
    key: string;
    fileName: string;
    fileSize: number;
    contentType: string;
  } | null>(() =>
    product?.isDigital && product.digitalFileKey
      ? {
          key: product.digitalFileKey,
          fileName: product.digitalFileName || "software.zip",
          fileSize: product.digitalFileSize || 0,
          contentType: product.digitalContentType || "application/octet-stream",
        }
      : null,
  );
  const [digitalUploading, setDigitalUploading] = useState(false);
  const digitalFileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const [{ data }] = useQuery({
    query: ProductFormQuery,
  });

  const form = useForm<InsertProducts>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      ...product,
      featured: product?.featured ?? false,
      discountEnabled: product?.discountEnabled ?? false,
      discountPercent: product?.discountPercent ?? null,
      soldAsPack: product?.soldAsPack ?? false,
      isDigital: product?.isDigital ?? false,
      packSize: product?.packSize ?? null,
      stock: typeof product?.stock === "number" ? product.stock : 1,
      featuredImageId:
        product?.featuredImageId ??
        (galleryMediaIds[0] ? galleryMediaIds[0] : undefined),
    },
  });

  const { register, control, handleSubmit, watch, setValue } = form;
  const isDraft = watch("isDraft");
  const isFeatured = watch("featured");

  useEffect(() => {
    setValue("featuredImageId", productImageMediaIds[0] ?? "", {
      shouldValidate: productImageMediaIds.length > 0,
      shouldDirty: true,
    });
  }, [productImageMediaIds, setValue]);
  const isSavingSingle = singleSaveStep !== null;
  const isFormBusy =
    isPending ||
    isSavingSingle ||
    bulkPhase === "preparing" ||
    bulkPhase === "uploading" ||
    bulkPhase === "creating";
  const singleSaveStepIndex = singleSaveStep
    ? SINGLE_SAVE_STEPS.findIndex((step) => step.key === singleSaveStep) + 1
    : 0;
  const singleSaveMessage =
    SINGLE_SAVE_STEPS.find((step) => step.key === singleSaveStep)?.message ??
    "Saving...";

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const response = await fetchWithTimeout("/api/admin/integrations", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as IntegrationsPayload;
        if (!active) return;

        const thresholdRaw = Number(
          payload.stockControl?.value?.lowStockThreshold ?? 5,
        );
        const lowStockThreshold = Number.isFinite(thresholdRaw)
          ? Math.min(99, Math.max(1, Math.round(thresholdRaw)))
          : 5;
        const enabled = Boolean(payload.stockControl?.isEnabled ?? false);
        setStockControl({ enabled, lowStockThreshold });

        if (!product && enabled) {
          const currentStock = Number(form.getValues("stock"));
          if (!Number.isFinite(currentStock)) {
            form.setValue("stock", 1);
          }
        }
      } catch {
        // Settings fetch failure should not block product edit/create.
      }
    };
    void loadSettings();

    return () => {
      active = false;
    };
  }, [form, product]);

  useEffect(() => {
    let active = true;
    const loadVariantTypes = async () => {
      try {
        const response = await fetchWithTimeout(
          "/api/admin/products/variant-types",
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { names?: string[] };
        if (!active) return;
        if (Array.isArray(payload.names) && payload.names.length > 0) {
          setKnownVariantTypes(payload.names.map(String).filter(Boolean));
        }
      } catch {
        // Keep defaults on failure.
      }
    };
    void loadVariantTypes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!product?.id) return;
    let active = true;
    const loadSizeConfig = async () => {
      try {
        const response = await fetchWithTimeout(
          `/api/admin/products/size-config?productId=${encodeURIComponent(product.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          config?: {
            enabled?: boolean;
            name?: string;
            options?: unknown[];
            groups?: Array<{
              id?: string;
              name?: string;
              options?: unknown[];
            }>;
          };
        };
        if (!active) return;
        const config = payload.config;
        if (!config) return;

        const groupsFromApi =
          Array.isArray(config.groups) && config.groups.length > 0
            ? config.groups.map((group, index) => ({
                id:
                  String(group.id ?? "").trim() ||
                  `group_${index + 1}_${createGroupId()}`,
                name:
                  String(group.name ?? "").trim() ||
                  DEFAULT_PRODUCT_OPTION_NAME,
                options: mapOptionsFromApi(group.options),
              }))
            : [
                {
                  id: createGroupId(),
                  name:
                    String(config.name ?? "").trim() ||
                    DEFAULT_PRODUCT_OPTION_NAME,
                  options: mapOptionsFromApi(config.options),
                },
              ];

        setSizeConfig({
          enabled: Boolean(config.enabled),
          groups: groupsFromApi,
        });
        setActiveVariantGroupId(groupsFromApi[0]?.id ?? "");
      } catch {
        // keep default config
      }
    };
    void loadSizeConfig();
    return () => {
      active = false;
    };
  }, [product?.id]);

  useEffect(() => {
    if (!sizeConfig.enabled || sizeConfig.groups.length === 0) return;
    if (sizeConfig.groups.some((group) => group.id === activeVariantGroupId)) {
      return;
    }
    setActiveVariantGroupId(sizeConfig.groups[0]?.id ?? "");
  }, [sizeConfig.enabled, sizeConfig.groups, activeVariantGroupId]);

  const normalizedSizeConfig = useMemo(() => {
    const groups = sizeConfig.groups
      .map((group, groupIndex) => {
        const dedup = new Map<
          string,
          { value: string; qty: number; price: number | null }
        >();
        for (const option of group.options) {
          const value = String(option.value ?? "")
            .trim()
            .slice(0, PRODUCT_OPTION_VALUE_MAX)
            .toUpperCase();
          const qty = normalizeSizeQtyInput(option.qty);
          const price = normalizeSizePriceInput(option.price);
          if (!value && qty <= 0 && price == null) continue;
          const key = value || "__NO_LABEL__";
          dedup.set(key, { value, qty, price });
        }
        const options = Array.from(dedup.values()).map((option) => ({
          value: option.value,
          size: option.value,
          qty: option.qty,
          price: option.price,
        }));
        return {
          id: String(group.id || `group_${groupIndex + 1}`),
          name:
            String(group.name ?? "")
              .trim()
              .slice(0, PRODUCT_OPTION_NAME_MAX) || DEFAULT_PRODUCT_OPTION_NAME,
          options,
        };
      })
      .filter((group) => group.options.length > 0 || group.name.length > 0);

    const first = groups[0];
    return {
      enabled: sizeConfig.enabled,
      groups,
      name: first?.name ?? DEFAULT_PRODUCT_OPTION_NAME,
      options: first?.options ?? [],
    };
  }, [sizeConfig.enabled, sizeConfig.groups]);

  const inBulkMode = !product && createMode === "bulk";
  const totalBulkImages = bulkFiles.length + selectedMediaIds.length;
  const canSubmitBulk = useMemo(
    () =>
      totalBulkImages > 0 &&
      totalBulkImages <= MAX_BULK_FILES &&
      !isPending &&
      bulkPhase !== "preparing",
    [bulkPhase, isPending, totalBulkImages],
  );

  const bulkOverlay = useMemo(() => {
    if (!inBulkMode || bulkPhase === "idle") return null;
    if (bulkProgress) {
      return {
        percent: bulkProgress.percent,
        message: bulkProgress.message,
      };
    }
    return {
      percent: 10,
      message: "Working...",
    };
  }, [bulkPhase, bulkProgress, inBulkMode]);

  const addLocalFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBulkPhase("preparing");
    setPrepareProgress({ current: 0, total: files.length });

    const { prepared, rejected } = await prepareImageFilesForDirect(
      files,
      (current, total) => {
        setPrepareProgress({ current, total });
      },
    );

    if (rejected.length > 0) {
      toast({
        title: `${rejected.length} file(s) skipped`,
        description: rejected
          .slice(0, 3)
          .map((entry) => entry.reason)
          .join(" "),
        variant: "destructive",
      });
      setBulkErrors((prev) => [
        ...prev,
        ...rejected.map((entry) => entry.reason),
      ]);
    }

    setBulkFiles((prev) =>
      mergeUniqueFiles(
        prev,
        prepared.map((item) => item.file),
      ),
    );
    setPrepareProgress(null);
    setBulkPhase("idle");
  };

  const toggleSelectedMediaId = (mediaId: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(mediaId)
        ? prev.filter((id) => id !== mediaId)
        : [...prev, mediaId],
    );
  };

  const toggleProductImageMediaId = (mediaId: string) => {
    setProductImageMediaIds((prev) => {
      if (prev.includes(mediaId)) {
        return prev.filter((id) => id !== mediaId);
      }
      if (prev.length >= MAX_PRODUCT_IMAGES) {
        toast({
          title: "Image limit reached",
          description: `You can add up to ${MAX_PRODUCT_IMAGES} images per product.`,
          variant: "destructive",
        });
        return prev;
      }
      return [...prev, mediaId];
    });
  };

  const removeProductImageMediaId = (mediaId: string) => {
    setProductImageMediaIds((prev) => prev.filter((id) => id !== mediaId));
  };

  const uploadDigitalSoftwareFile = async (file: File) => {
    setDigitalUploading(true);
    try {
      assertDigitalUploadLimits({
        fileName: file.name,
        fileSize: file.size,
      });

      const initRes = await fetchWithTimeout(
        "/api/admin/products/digital-file/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: DIGITAL_ZIP_CONTENT_TYPE,
            fileSize: file.size,
          }),
        },
      );
      const initBody = (await initRes.json().catch(() => null)) as {
        message?: string;
        key?: string;
        uploadUrl?: string;
        fileName?: string;
      } | null;
      if (!initRes.ok || !initBody?.key || !initBody.uploadUrl) {
        throw new Error(
          initBody?.message || "Could not start software upload.",
        );
      }

      let putRes: Response;
      try {
        putRes = await fetch(initBody.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": DIGITAL_ZIP_CONTENT_TYPE,
            "Content-Length": String(file.size),
          },
          body: file,
        });
      } catch (networkError) {
        throw new Error(formatDigitalUploadNetworkError(networkError));
      }
      if (!putRes.ok) {
        throw new Error(
          `Software upload failed (${putRes.status}). Please retry.`,
        );
      }

      const completeRes = await fetchWithTimeout(
        "/api/admin/products/digital-file/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: initBody.key,
            fileName: file.name,
            contentType: DIGITAL_ZIP_CONTENT_TYPE,
            fileSize: file.size,
          }),
        },
      );
      const completeBody = (await completeRes.json().catch(() => null)) as {
        message?: string;
        key?: string;
        fileName?: string;
        fileSize?: number;
        contentType?: string;
      } | null;
      if (!completeRes.ok || !completeBody?.key) {
        throw new Error(
          completeBody?.message || "Could not finish software upload.",
        );
      }

      setDigitalFile({
        key: completeBody.key,
        fileName: completeBody.fileName || file.name,
        fileSize: completeBody.fileSize || file.size,
        contentType: completeBody.contentType || DIGITAL_ZIP_CONTENT_TYPE,
      });
      toast({
        title: "Software file uploaded",
        description: completeBody.fileName || file.name,
      });
    } catch (error) {
      toast({
        title: "Software upload failed",
        description:
          error instanceof Error
            ? formatDigitalUploadNetworkError(error)
            : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setDigitalUploading(false);
      if (digitalFileInputRef.current) digitalFileInputRef.current.value = "";
    }
  };

  const setProductImageAsMain = (mediaId: string) => {
    setProductImageMediaIds((prev) => {
      if (!prev.includes(mediaId)) return prev;
      return [mediaId, ...prev.filter((id) => id !== mediaId)];
    });
  };

  const onSingleSubmit = async (data: InsertProducts) => {
    setSavedSummary(null);
    setSingleSaveStep("product");

    try {
      if (productImageMediaIds.length === 0) {
        throw new Error("Select at least one product image.");
      }

      if (normalizedSizeConfig.enabled && !data.isDigital) {
        const activeGroups = normalizedSizeConfig.groups.filter((group) =>
          group.options.some((option) => Number(option.qty ?? 0) > 0),
        );
        if (activeGroups.length === 0) {
          throw new Error(
            "Add at least one variant group with stock when options/variants are enabled.",
          );
        }
        for (const group of activeGroups) {
          const stocked = group.options.filter(
            (option) => Number(option.qty ?? 0) > 0,
          );
          const missingPrice = stocked.find((option) => option.price == null);
          if (missingPrice) {
            const label =
              String(missingPrice.value ?? "").trim() || "an option";
            throw new Error(
              `Enter a price for ${group.name} → ${label} (0 is allowed).`,
            );
          }
        }
      }

      // When variants are on, the product MRP field is inactive — sync DB price
      // to the cheapest option so shop cards / JSON-LD stay sensible.
      const syncedMinPrice = normalizedSizeConfig.enabled
        ? getMinSelectableOptionPrice(normalizedSizeConfig)
        : null;
      const priceForSave =
        syncedMinPrice != null ? String(syncedMinPrice) : data.price;

      const payload = normalizeProductFormPayload(
        {
          ...data,
          price: priceForSave,
          featuredImageId: productImageMediaIds[0],
          isDigital: Boolean(data.isDigital),
          digitalFileKey: data.isDigital ? digitalFile?.key : null,
          digitalFileName: data.isDigital ? digitalFile?.fileName : null,
          digitalFileSize: data.isDigital ? digitalFile?.fileSize : null,
          digitalContentType: data.isDigital ? digitalFile?.contentType : null,
        },
        {
          stockFallback: stockControl.enabled ? 1 : 0,
        },
      );

      // Use JSON API instead of Server Actions — Workers often wrap action
      // failures as opaque "Server Components render" errors.
      const saveResponse = await fetchWithTimeout(
        "/api/admin/products/manage",
        {
          method: product ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product?.id,
            product: payload,
            imageMediaIds: productImageMediaIds,
          }),
        },
      );

      const saveBody = (await saveResponse.json().catch(() => null)) as {
        message?: string;
        product?: SelectProducts;
      } | null;

      if (!saveResponse.ok || !saveBody?.product) {
        throw new Error(
          saveBody?.message || "Could not save product. Please retry.",
        );
      }

      const savedProduct = saveBody.product;
      setSingleSaveStep("sizes");

      const productId = savedProduct.id;
      if (!productId) {
        throw new Error("Product id missing after save.");
      }

      const sizeSave = await fetchWithTimeout(
        "/api/admin/products/size-config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            config: data.isDigital
              ? { enabled: false, groups: [] }
              : normalizedSizeConfig,
          }),
        },
      );

      if (!sizeSave.ok) {
        const sizeError = (await sizeSave.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          sizeError?.message || "Could not save size configuration.",
        );
      }

      setSingleSaveStep("storefront");

      form.reset({
        ...savedProduct,
        featured: savedProduct.featured ?? false,
        stock: typeof savedProduct.stock === "number" ? savedProduct.stock : 1,
      });
      setProductImageMediaIds(productImageMediaIds);
      if (savedProduct.isDigital && savedProduct.digitalFileKey) {
        setDigitalFile({
          key: savedProduct.digitalFileKey,
          fileName: savedProduct.digitalFileName || "software.zip",
          fileSize: savedProduct.digitalFileSize || 0,
          contentType:
            savedProduct.digitalContentType || "application/octet-stream",
        });
      } else {
        setDigitalFile(null);
      }
      setSavedSummary(productStorefrontVisibilitySummary(savedProduct));

      toast({
        title: product ? "Product updated" : "Product created",
        description: productStorefrontVisibilitySummary(savedProduct),
      });

      if (!product) {
        router.push("/admin/products");
      } else {
        router.replace(`/admin/products/${productId}`);
      }
    } catch (err) {
      toast({
        title: "Unable to save product",
        description:
          err instanceof Error ? err.message : "Please retry in a moment.",
        variant: "destructive",
      });
    } finally {
      setSingleSaveStep(null);
    }
  };

  const onBulkSubmit = async () => {
    if (!canSubmitBulk) {
      toast({
        title: "Select images",
        description: `Select 1 to ${MAX_BULK_FILES} total images from Media Library and/or Computer.`,
        variant: "destructive",
      });
      return;
    }

    const isValid = await form.trigger(BULK_SHARED_FIELDS);
    if (!isValid) {
      toast({
        title: "Fix form errors",
        description: "Complete the required fields before bulk create.",
        variant: "destructive",
      });
      return;
    }

    const values = form.getValues();

    let shared: BulkSharedPayload;
    try {
      shared = buildBulkSharedPayloadFromForm(values);
    } catch (error) {
      toast({
        title: "Invalid bulk details",
        description:
          error instanceof Error
            ? error.message
            : "Check discount and required fields.",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        setBulkCreated([]);
        setBulkErrors([]);
        setBulkFailures([]);
        setBulkPhase("uploading");

        const result = await runBulkDraftUpload({
          files: bulkFiles,
          selectedMediaIds,
          shared: {
            name: shared.baseName,
            description: shared.description,
            isDraft: shared.isDraft,
            collectionId: shared.collectionId,
            badge: shared.badge,
            rating: shared.rating,
            price: shared.price,
            stock: shared.stock,
            discountEnabled: shared.discountEnabled,
            discountPercent: shared.discountPercent,
            soldAsPack: shared.soldAsPack,
            packSize: shared.packSize,
          },
          onProgress: (update) => {
            setBulkProgress(update);
            setBulkPhase(
              update.phase === "complete" ? "creating" : "uploading",
            );
          },
        });

        setBulkCreated(result.created);
        setBulkErrors(result.errors);
        setBulkFailures(result.failures);

        if (result.created.length === 0) {
          throw new Error(
            result.errors[0] ||
              "No products were created. Check selected images and shared details.",
          );
        }

        toast({
          title: "Bulk create finished",
          description:
            result.errors.length > 0
              ? `${result.created.length} products created with ${result.errors.length} warning(s).`
              : `${result.created.length} products created.`,
        });

        if (result.failures.length === 0) {
          setBulkFiles([]);
        } else {
          setBulkFiles(result.failures.map((entry) => entry.file));
        }
        if (result.created.length > 0) {
          setSelectedMediaIds([]);
        }
        router.refresh();
      } catch (error) {
        toast({
          title: "Bulk create failed",
          description: error instanceof Error ? error.message : "Please retry.",
          variant: "destructive",
        });
      } finally {
        setBulkProgress(null);
        setBulkPhase("idle");
      }
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormBusy) return;
    if (inBulkMode) {
      void onBulkSubmit();
      return;
    }
    startTransition(() => {
      void handleSubmit(onSingleSubmit)();
    });
  };

  const updateGroupName = (groupIndex: number, name: string) => {
    const nextName = name.slice(0, PRODUCT_OPTION_NAME_MAX);
    setSizeConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              name: nextName,
            }
          : group,
      ),
    }));
    const trimmed = nextName.trim();
    if (trimmed) {
      setKnownVariantTypes((prev) => mergeVariantTypeNames(prev, [trimmed]));
    }
  };

  const openCustomTypeDialog = () => {
    setCustomTypeNameDraft("");
    setCustomTypeError(null);
    setCustomTypeDialogOpen(true);
  };

  const confirmCustomTypeName = () => {
    const name = customTypeNameDraft.trim().slice(0, PRODUCT_OPTION_NAME_MAX);
    if (!name) {
      setCustomTypeError("Enter a type name.");
      return;
    }
    const key = name.toLowerCase();
    const activeGroup = sizeConfig.groups.find(
      (group) => group.id === activeVariantGroupId,
    );
    const renamingUntitled = Boolean(activeGroup && !activeGroup.name.trim());
    const duplicate = sizeConfig.groups.some((group) => {
      if (renamingUntitled && group.id === activeVariantGroupId) return false;
      return group.name.trim().toLowerCase() === key;
    });
    if (duplicate) {
      setCustomTypeError("This product already has that type.");
      return;
    }
    if (renamingUntitled) {
      const index = sizeConfig.groups.findIndex(
        (group) => group.id === activeVariantGroupId,
      );
      if (index >= 0) updateGroupName(index, name);
    } else {
      addVariantGroup(name);
    }
    setKnownVariantTypes((prev) => mergeVariantTypeNames(prev, [name]));
    setCustomTypeDialogOpen(false);
    setCustomTypeNameDraft("");
    setCustomTypeError(null);
  };

  const updateSizeOption = (
    groupIndex: number,
    optionIndex: number,
    key: keyof SizeOptionForm,
    value: string,
  ) => {
    setSizeConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((group, gi) =>
        gi === groupIndex
          ? {
              ...group,
              options: group.options.map((option, oi) =>
                oi === optionIndex ? { ...option, [key]: value } : option,
              ),
            }
          : group,
      ),
    }));
  };

  const addSizeOption = (groupIndex: number) => {
    setSizeConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((group, gi) =>
        gi === groupIndex
          ? {
              ...group,
              options: [...group.options, { value: "", qty: "", price: "" }],
            }
          : group,
      ),
    }));
  };

  const removeSizeOption = (groupIndex: number, optionIndex: number) => {
    setSizeConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((group, gi) => {
        if (gi !== groupIndex) return group;
        const nextOptions =
          group.options.length <= 1
            ? [{ value: "", qty: "", price: "" }]
            : group.options.filter((_, i) => i !== optionIndex);
        return { ...group, options: nextOptions };
      }),
    }));
  };

  const addVariantGroup = (name = "") => {
    const nextGroup = createEmptyGroup(name);
    setSizeConfig((prev) => ({
      ...prev,
      groups: [...prev.groups, nextGroup],
    }));
    setActiveVariantGroupId(nextGroup.id);
    return nextGroup.id;
  };

  const removeVariantGroup = (groupIndex: number) => {
    setSizeConfig((prev) => ({
      ...prev,
      groups:
        prev.groups.length <= 1
          ? [createEmptyGroup()]
          : prev.groups.filter((_, i) => i !== groupIndex),
    }));
  };

  const selectVariantGroup = (value: string) => {
    if (value === ADD_CUSTOM_VARIANT_VALUE) {
      openCustomTypeDialog();
      return;
    }
    if (value.startsWith(ADD_TYPE_PREFIX)) {
      const name = value.slice(ADD_TYPE_PREFIX.length).trim();
      if (name) addVariantGroup(name);
      return;
    }
    setActiveVariantGroupId(value);
    const group = sizeConfig.groups.find((item) => item.id === value);
    if (group && !group.name.trim()) {
      openCustomTypeDialog();
    }
  };

  const variantsEnabled = sizeConfig.enabled;
  const activeVariantGroupIndex = sizeConfig.groups.findIndex(
    (group) => group.id === activeVariantGroupId,
  );
  const activeVariantGroup =
    activeVariantGroupIndex >= 0
      ? sizeConfig.groups[activeVariantGroupIndex]
      : sizeConfig.groups[0];
  const activeGroupIndex =
    activeVariantGroupIndex >= 0 ? activeVariantGroupIndex : 0;
  const usedVariantTypeKeys = useMemo(
    () =>
      new Set(
        sizeConfig.groups
          .map((group) => group.name.trim().toLowerCase())
          .filter(Boolean),
      ),
    [sizeConfig.groups],
  );
  const availableKnownVariantTypes = useMemo(
    () =>
      knownVariantTypes.filter(
        (name) => !usedVariantTypeKeys.has(name.trim().toLowerCase()),
      ),
    [knownVariantTypes, usedVariantTypeKeys],
  );

  return (
    <Form {...form}>
      <AdminSaveProgressOverlay
        open={isSavingSingle}
        title={product ? "Updating product" : "Creating product"}
        message={singleSaveMessage}
        step={singleSaveStepIndex}
        totalSteps={SINGLE_SAVE_STEPS.length}
      />
      <AdminSaveProgressOverlay
        open={Boolean(bulkOverlay)}
        title="Uploading products"
        message={bulkOverlay?.message ?? "Working…"}
        percent={bulkOverlay?.percent ?? 0}
      />
      <form
        id="project-form"
        className={`gap-x-5 flex gap-y-5 flex-col px-3 ${isFormBusy ? "pointer-events-none opacity-80" : ""}`}
        onSubmit={onSubmit}
        aria-busy={isFormBusy}
      >
        <div className="flex flex-col gap-y-5 max-w-[500px]">
          {!product ? (
            <FormItem>
              <FormLabel className="text-sm">Create mode</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={createMode === "single" ? "default" : "outline"}
                    onClick={() => setCreateMode("single")}
                  >
                    Single Product
                  </Button>
                  <Button
                    type="button"
                    variant={createMode === "bulk" ? "default" : "outline"}
                    onClick={() => setCreateMode("bulk")}
                  >
                    Bulk from images
                  </Button>
                </div>
              </FormControl>
              <FormDescription>
                Bulk mode reuses shared details and creates one product per
                image.
              </FormDescription>
            </FormItem>
          ) : null}

          <FormItem>
            <FormLabel className="text-sm">Product Code</FormLabel>
            <FormControl>
              <Input
                value={form.watch("productCode") ?? ""}
                readOnly
                placeholder="Auto-generated (ST...)"
              />
            </FormControl>
            <FormDescription>
              Auto-generated when the product is saved (e.g. ST000045).
            </FormDescription>
            <FormMessage />
          </FormItem>

          <FormField
            control={control}
            name="isDraft"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm">Draft Product</FormLabel>
                <FormControl>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(field.value)}
                      onChange={(event) => field.onChange(event.target.checked)}
                    />
                    Keep hidden from storefront until details are finalized.
                  </label>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel className="text-sm">Name*</FormLabel>
            <FormControl>
              <Input
                aria-invalid={!!form.formState.errors.name}
                placeholder="Type Product Name."
                {...register("name")}
              />
            </FormControl>
            <FormDescription>
              The storefront URL is created automatically from this name when
              you first save.
            </FormDescription>
            <FormMessage />
          </FormItem>

          <FormItem>
            <FormLabel className="text-sm">Description*</FormLabel>
            <FormControl>
              <Textarea
                defaultValue={product?.description || ""}
                aria-invalid={!!form.formState.errors.description}
                placeholder="Describe this product for customers — materials, what’s included, and how it feels to use."
                className="min-h-[120px]"
                {...register("description")}
              />
            </FormControl>
            <FormDescription>
              Shown on the product page, just like category descriptions on
              collection pages. Write a clear customer-facing paragraph.
            </FormDescription>
            <FormMessage />
          </FormItem>

          <FormField
            control={control}
            name="featured"
            render={({ field }) => (
              <FormItem className="rounded-md border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <FormControl>
                    <Checkbox
                      checked={Boolean(field.value)}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel className="text-sm font-semibold">
                      Featured product
                    </FormLabel>
                    <FormDescription>
                      Show this product on the homepage Featured carousel and
                      the Featured Products page. Uncheck Draft above — draft
                      products stay hidden even when featured.
                    </FormDescription>
                    {isFeatured && isDraft ? (
                      <p className="text-xs font-medium text-amber-700">
                        This product is still a draft, so it will not appear on
                        the website until Draft is unchecked.
                      </p>
                    ) : null}
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {savedSummary ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {savedSummary}
            </div>
          ) : null}

          <Suspense>
            {data && data.collectionsCollection && (
              <FormField
                control={control}
                name={"collectionId"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catalog *</FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a catalog" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {data.collectionsCollection.edges.map(
                          ({ node: collection }) => (
                            <SelectItem
                              value={collection.id}
                              key={collection.id}
                            >
                              {collection.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Required. Product must belong to a storefront catalog.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </Suspense>

          <BadgeSelectField name="badge" label={""} />

          <FormItem>
            <FormLabel className="text-sm">Rating*</FormLabel>
            <FormControl>
              <Input
                defaultValue={product?.rating}
                aria-invalid={!!form.formState.errors.rating}
                placeholder="Rating (0-5)."
                {...register("rating")}
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          <FormItem>
            <FormLabel
              className={
                variantsEnabled ? "text-sm text-muted-foreground" : "text-sm"
              }
            >
              Price (MRP){variantsEnabled ? "" : "*"}
            </FormLabel>
            <FormControl>
              <Input
                defaultValue={product?.price}
                aria-invalid={!!form.formState.errors.price}
                placeholder="Original price in ₹ (e.g. 1299)"
                disabled={variantsEnabled}
                className={
                  variantsEnabled
                    ? "cursor-not-allowed bg-muted text-muted-foreground opacity-70"
                    : undefined
                }
                {...register("price")}
              />
            </FormControl>
            <FormDescription>
              {variantsEnabled
                ? "Inactive while options are enabled — set prices on each choice below."
                : "List price before discount. Customers pay less only when discount is enabled below."}
            </FormDescription>
            <FormMessage />
          </FormItem>

          <FormField
            control={control}
            name="discountEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 rounded-lg border p-4">
                <FormControl>
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => {
                      field.onChange(Boolean(checked));
                      if (!checked) {
                        form.setValue("discountPercent", null);
                      } else if (!form.getValues("discountPercent")) {
                        form.setValue("discountPercent", 10);
                      }
                    }}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Enable discount</FormLabel>
                  <FormDescription>
                    Show sale price with strikethrough MRP and a percentage
                    badge on the website.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {watch("discountEnabled") ? (
            <FormItem>
              <FormLabel className="text-sm">Discount %</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  placeholder="e.g. 50"
                  {...register("discountPercent", { valueAsNumber: true })}
                />
              </FormControl>
              <FormMessage />
              <DiscountPreview
                price={watch("price")}
                discountPercent={watch("discountPercent")}
              />
            </FormItem>
          ) : null}

          <FormField
            control={control}
            name="soldAsPack"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 rounded-lg border p-4">
                <FormControl>
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => {
                      field.onChange(Boolean(checked));
                      if (!checked) {
                        form.setValue("packSize", null);
                      } else if (!form.getValues("packSize")) {
                        form.setValue("packSize", 50);
                      }
                    }}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Sold as set / pack</FormLabel>
                  <FormDescription>
                    Show “Set of N” near the price. Quantity 1 means 1 set (not
                    one loose piece). Price and stock stay per set.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {watch("soldAsPack") ? (
            <FormItem>
              <FormLabel className="text-sm">Pieces per set*</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={2}
                  max={9999}
                  step={1}
                  placeholder="e.g. 50"
                  {...register("packSize", { valueAsNumber: true })}
                />
              </FormControl>
              <FormDescription>
                Customers see “Set of {watch("packSize") || "N"}” on the product
                page.
              </FormDescription>
              <FormMessage />
            </FormItem>
          ) : null}

          <FormField
            control={control}
            name="isDigital"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 rounded-lg border p-4">
                <FormControl>
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => {
                      field.onChange(Boolean(checked));
                      if (checked) {
                        form.setValue("soldAsPack", false);
                        form.setValue("packSize", null);
                      }
                    }}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Software / digital product</FormLabel>
                  <FormDescription>
                    After the customer pays, they get a Download button on the
                    order page. No courier charge for this item.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          {watch("isDigital") ? (
            <FormItem>
              <FormLabel className="text-sm">Software file*</FormLabel>
              <input
                ref={digitalFileInputRef}
                type="file"
                className="hidden"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadDigitalSoftwareFile(file);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={digitalUploading || isPending}
                  onClick={() => digitalFileInputRef.current?.click()}
                >
                  {digitalUploading
                    ? "Uploading…"
                    : digitalFile
                      ? "Replace file"
                      : "Upload file"}
                </Button>
                {digitalFile ? (
                  <p className="text-sm text-muted-foreground">
                    {digitalFile.fileName}
                    {digitalFile.fileSize
                      ? ` · ${Math.max(1, Math.round(digitalFile.fileSize / 1024))} KB`
                      : ""}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Zip only, up to {DIGITAL_UPLOAD_LIMIT_MB} MB.
                  </p>
                )}
              </div>
            </FormItem>
          ) : null}

          <FormField
            control={control}
            name="stock"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm">Stock</FormLabel>
                <FormControl>
                  <BoundedNumberInput
                    min={0}
                    max={99999}
                    value={
                      Number.isFinite(Number(field.value))
                        ? Math.max(0, Math.round(Number(field.value)))
                        : 0
                    }
                    onValueChange={field.onChange}
                    aria-invalid={!!form.formState.errors.stock}
                    placeholder={
                      stockControl.enabled
                        ? "Stock quantity (default 1 for new product)"
                        : "Stock quantity"
                    }
                  />
                </FormControl>
                <FormDescription>
                  {stockControl.enabled
                    ? `Low-stock notice appears below ${stockControl.lowStockThreshold}.`
                    : "Stock control is disabled; storefront behavior remains unchanged."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel className="text-sm">Options / variants</FormLabel>
            <FormControl>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sizeConfig.enabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setSizeConfig((prev) => ({
                      enabled,
                      groups:
                        enabled && !hasAnyGroupConfigured(prev.groups)
                          ? [createDefaultSizeGroup()]
                          : prev.groups.length > 0
                            ? prev.groups
                            : [createEmptyGroup()],
                    }));
                    if (enabled) {
                      const current = String(
                        form.getValues("price") ?? "",
                      ).trim();
                      if (!current) {
                        form.setValue("price", "0");
                      }
                    }
                  }}
                />
                Enable
              </label>
            </FormControl>
          </FormItem>

          {sizeConfig.enabled && activeVariantGroup ? (
            <FormItem className="space-y-4 rounded-lg border border-border/80 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[14rem] flex-1 space-y-1">
                  <FormLabel className="text-sm">Variant type</FormLabel>
                  <Select
                    value={activeVariantGroup.id}
                    onValueChange={selectVariantGroup}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select variant type" />
                    </SelectTrigger>
                    <SelectContent>
                      {sizeConfig.groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name.trim() || "Untitled"}
                        </SelectItem>
                      ))}
                      {availableKnownVariantTypes.length > 0 ? (
                        <SelectSeparator />
                      ) : null}
                      {availableKnownVariantTypes.map((name) => (
                        <SelectItem
                          key={`${ADD_TYPE_PREFIX}${name}`}
                          value={`${ADD_TYPE_PREFIX}${name}`}
                        >
                          Add {name}
                        </SelectItem>
                      ))}
                      <SelectItem value={ADD_CUSTOM_VARIANT_VALUE}>
                        Custom…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose Size, Magnet, Colour, or Custom. This label shows on
                    the product page.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={sizeConfig.groups.length <= 1}
                  onClick={() => removeVariantGroup(activeGroupIndex)}
                >
                  Remove type
                </Button>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-sm">
                  Values, stock &amp; price
                </FormLabel>
                <FormControl>
                  <div className="space-y-2">
                    <div className="hidden grid-cols-[1fr,0.7fr,0.9fr,auto] gap-2 text-xs text-muted-foreground sm:grid">
                      <span>Value</span>
                      <span>Stock</span>
                      <span>Price (₹)</span>
                      <span className="w-20" />
                    </div>
                    {activeVariantGroup.options.map((option, optionIndex) => (
                      <div
                        key={optionIndex}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,0.7fr,0.9fr,auto]"
                      >
                        <Input
                          value={option.value}
                          maxLength={PRODUCT_OPTION_VALUE_MAX}
                          placeholder="Value (e.g. XL / WITH MAGNET)"
                          onChange={(event) =>
                            updateSizeOption(
                              activeGroupIndex,
                              optionIndex,
                              "value",
                              event.target.value
                                .trimStart()
                                .slice(0, PRODUCT_OPTION_VALUE_MAX)
                                .toUpperCase(),
                            )
                          }
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={option.qty}
                          placeholder="Stock qty"
                          onChange={(event) =>
                            updateSizeOption(
                              activeGroupIndex,
                              optionIndex,
                              "qty",
                              event.target.value.replace(/[^0-9.]/g, ""),
                            )
                          }
                          onBlur={(event) =>
                            updateSizeOption(
                              activeGroupIndex,
                              optionIndex,
                              "qty",
                              String(normalizeSizeQtyInput(event.target.value)),
                            )
                          }
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={option.price}
                          placeholder="Price"
                          aria-label={`Price for ${activeVariantGroup.name} option ${optionIndex + 1}`}
                          onChange={(event) =>
                            updateSizeOption(
                              activeGroupIndex,
                              optionIndex,
                              "price",
                              event.target.value.replace(/[^0-9.]/g, ""),
                            )
                          }
                          onBlur={(event) => {
                            const normalized = normalizeSizePriceInput(
                              event.target.value,
                            );
                            updateSizeOption(
                              activeGroupIndex,
                              optionIndex,
                              "price",
                              normalized == null ? "" : String(normalized),
                            );
                          }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() =>
                            removeSizeOption(activeGroupIndex, optionIndex)
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addSizeOption(activeGroupIndex)}
                    >
                      Add choice
                    </Button>
                  </div>
                </FormControl>
              </div>
            </FormItem>
          ) : null}

          {inBulkMode ? (
            <FormItem>
              <FormLabel>Bulk Images*</FormLabel>
              <FormControl>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending || bulkPhase === "preparing"}
                      onClick={() => setIsMediaDialogOpen(true)}
                    >
                      Add from Media Library
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending || bulkPhase === "preparing"}
                      onClick={() => localFileInputRef.current?.click()}
                    >
                      Upload from Computer
                    </Button>
                  </div>

                  <input
                    ref={localFileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      void addLocalFiles(selected);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              </FormControl>
              <FormDescription>
                Select up to {MAX_BULK_FILES} images. Each image becomes one
                product using the shared details above. Max {UPLOAD_LIMIT_MB} MB
                per image; photos are optimized automatically before upload.
              </FormDescription>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Selected images: {totalBulkImages} (Media:{" "}
                {selectedMediaIds.length}, Computer: {bulkFiles.length})
                {totalBulkImages > MAX_BULK_FILES
                  ? ` (maximum ${MAX_BULK_FILES}; remove some files)`
                  : ""}
              </p>
              {bulkPhase === "preparing" || (isPending && inBulkMode) ? (
                <AdminLoadingState
                  message={
                    bulkPhase === "preparing"
                      ? `Optimizing photos... ${prepareProgress?.current ?? 0}/${prepareProgress?.total ?? 0}`
                      : bulkProgress?.message ?? "Creating products..."
                  }
                />
              ) : null}

              {selectedMediaIds.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium">From Media Library</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMediaIds.map((mediaId) => (
                      <button
                        key={mediaId}
                        type="button"
                        className="rounded border px-2 py-1 text-xs hover:bg-muted"
                        onClick={() => toggleSelectedMediaId(mediaId)}
                        title="Remove from selection"
                      >
                        {mediaId}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {bulkFiles.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium">From Computer</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {bulkFiles.map((file) => (
                      <div
                        key={`${file.name}:${file.size}:${file.lastModified}`}
                        className="flex items-center justify-between gap-3 rounded border px-2 py-1"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          className="text-destructive"
                          disabled={isPending || bulkPhase === "preparing"}
                          onClick={() =>
                            setBulkFiles((prev) =>
                              prev.filter(
                                (item) =>
                                  !(
                                    item.name === file.name &&
                                    item.size === file.size &&
                                    item.lastModified === file.lastModified
                                  ),
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </FormItem>
          ) : (
            <FormField
              control={form.control}
              name="featuredImageId"
              render={() => (
                <FormItem>
                  <FormLabel>Product images*</FormLabel>
                  <div className="space-y-3">
                    {productImageMediaIds.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {productImageMediaIds.map((mediaId, index) => (
                          <div
                            key={mediaId}
                            className="relative w-[120px] space-y-1"
                          >
                            <div className="relative">
                              <ImagePreviewCard mediaId={mediaId} />
                              {index === 0 ? (
                                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                                  Main
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground shadow hover:text-destructive"
                                aria-label="Remove image"
                                onClick={() =>
                                  removeProductImageMediaId(mediaId)
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {index > 0 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-full px-1 text-[11px]"
                                onClick={() => setProductImageAsMain(mediaId)}
                              >
                                Set as main
                              </Button>
                            ) : (
                              <p className="text-center text-[11px] text-muted-foreground">
                                Main photo
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <Button
                      type="button"
                      variant="default"
                      className="h-10 gap-2 px-4 font-medium"
                      onClick={() => setIsProductImagesDialogOpen(true)}
                    >
                      {productImageMediaIds.length
                        ? "Add / change images"
                        : "Select product images"}
                    </Button>
                  </div>

                  <FormDescription>
                    Select up to {MAX_PRODUCT_IMAGES} images. The first image is
                    the main photo; the rest appear as gallery thumbnails on the
                    product page.
                  </FormDescription>
                  <FormMessage />
                  {!productImageMediaIds.length ? (
                    <p className="text-sm font-medium text-destructive">
                      At least one product image is required.
                    </p>
                  ) : null}
                </FormItem>
              )}
            />
          )}

          {!inBulkMode ? (
            <Dialog
              open={customTypeDialogOpen}
              onOpenChange={(open) => {
                setCustomTypeDialogOpen(open);
                if (!open) {
                  setCustomTypeNameDraft("");
                  setCustomTypeError(null);
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Custom variant type</DialogTitle>
                  <DialogDescription>
                    Enter the label customers will see (e.g. Finish, Style).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <FormLabel htmlFor="custom-variant-type-name">
                    Type name
                  </FormLabel>
                  <Input
                    id="custom-variant-type-name"
                    autoFocus
                    value={customTypeNameDraft}
                    maxLength={PRODUCT_OPTION_NAME_MAX}
                    placeholder="e.g. Finish"
                    onChange={(event) => {
                      setCustomTypeNameDraft(event.target.value);
                      if (customTypeError) setCustomTypeError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        confirmCustomTypeName();
                      }
                    }}
                  />
                  {customTypeError ? (
                    <p className="text-sm text-destructive">
                      {customTypeError}
                    </p>
                  ) : null}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCustomTypeDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={confirmCustomTypeName}>
                    Add type
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}

          {!inBulkMode ? (
            <Dialog
              open={isProductImagesDialogOpen}
              onOpenChange={setIsProductImagesDialogOpen}
            >
              <DialogContent className="flex max-h-[90vh] max-w-[1080px] flex-col overflow-hidden sm:max-w-[1080px]">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Select product images</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Suspense>
                    <UploadMediaContainer
                      onClickItemsHandler={toggleProductImageMediaId}
                      selectedImageIds={productImageMediaIds}
                      defaultImageId={productImageMediaIds[0]}
                    />
                  </Suspense>
                </div>
                <div className="flex shrink-0 items-center justify-between border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Selected: {productImageMediaIds.length}/{MAX_PRODUCT_IMAGES}
                    {productImageMediaIds.length
                      ? " — first selected is Main"
                      : ""}
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      form.setValue(
                        "featuredImageId",
                        productImageMediaIds[0] ?? "",
                        { shouldValidate: true, shouldDirty: true },
                      );
                      setIsProductImagesDialogOpen(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {inBulkMode ? (
            <Dialog
              open={isMediaDialogOpen}
              onOpenChange={setIsMediaDialogOpen}
            >
              <DialogContent className="flex max-h-[90vh] max-w-[1080px] flex-col overflow-hidden sm:max-w-[1080px]">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Select images from Media Library</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Suspense>
                    <UploadMediaContainer
                      onClickItemsHandler={toggleSelectedMediaId}
                      selectedImageIds={selectedMediaIds}
                    />
                  </Suspense>
                </div>
                <div className="flex shrink-0 items-center justify-between border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Selected from media: {selectedMediaIds.length}
                  </p>
                  <Button
                    type="button"
                    onClick={() => setIsMediaDialogOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {bulkCreated.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Created products</h4>
              <ul className="space-y-1 text-sm">
                {bulkCreated.map((created) => (
                  <li key={created.id}>
                    <Link
                      href={`/admin/products/${created.id}`}
                      className="text-primary hover:underline"
                    >
                      {created.productCode} - {created.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {bulkErrors.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-destructive">
                Upload issues
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {bulkErrors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {bulkFailures.length > 0 ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">
                {bulkFailures.length} file(s) still need upload
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Failed files remain in the Computer list. Fix or compress them,
                then click Create again to retry only those files.
              </p>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-10 -mx-3 border-t bg-background/95 px-3 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button
              type="submit"
              disabled={isFormBusy || (inBulkMode && !canSubmitBulk)}
              variant={"outline"}
              form="project-form"
            >
              <LoadingButtonLabel
                isLoading={isFormBusy && !inBulkMode}
                loadingText={
                  singleSaveMessage || (product ? "Updating..." : "Creating...")
                }
                idleText={
                  product ? "Update" : inBulkMode ? "Create Bulk" : "Create"
                }
              />
            </Button>
            {isFormBusy && !inBulkMode ? (
              <AdminLoadingState message={singleSaveMessage} />
            ) : null}
            <Link
              href="/admin/products"
              className={`${buttonVariants()} ${isFormBusy ? "pointer-events-none opacity-50" : ""}`}
              aria-disabled={isFormBusy}
              tabIndex={isFormBusy ? -1 : 0}
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </Form>
  );
}

export default ProductFrom;

function DiscountPreview({
  price,
  discountPercent,
}: {
  price: string | number | null | undefined;
  discountPercent: number | null | undefined;
}) {
  const previewProduct = {
    price,
    discountEnabled: true,
    discountPercent,
  };

  if (!isProductDiscountActive(previewProduct)) {
    return (
      <p className="text-xs text-muted-foreground">
        Enter a valid discount between 1% and 99%.
      </p>
    );
  }

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground mb-1">
        Customer will see
      </p>
      <ProductPriceDisplay product={previewProduct} />
      <p className="mt-2 text-xs text-muted-foreground">
        MRP {formatPrice(getOriginalProductPrice(previewProduct))} → sale{" "}
        {formatPrice(getSaleProductPrice(previewProduct))}
      </p>
    </div>
  );
}
