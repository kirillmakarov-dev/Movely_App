import type { MoveLocationDto, MoveRequestResponse, MoveScheduleDto, UpdateMoveRequestRequest } from "@/lib/movely-api";
import type { FormState } from "./request-flow-types";
import { APARTMENT_INVENTORY_KIND, SMALL_MOVE_ITEM_KIND, SPECIAL_ITEM_KIND } from "./request-flow-data";

export function makeLocation(): MoveLocationDto {
  return {
    city: "",
    exactAddress: "",
    floor: null,
    hasElevator: null,
    elevatorFurnitureSuitability: "Unknown",
    stairsInfo: "",
    truckAccessInfo: "",
    parkingDistanceMeters: null,
  };
}

export function makeFormState(): FormState {
  return {
    requestType: null,
    pickup: makeLocation(),
    destination: makeLocation(),
    apartmentRooms: null,
    smallBoxes: 0,
    mediumBoxes: 0,
    largeBoxes: 0,
    apartmentInventory: [],
    specialItems: [],
    smallMoveItems: [],
    furnitureDisassembly: false,
    furnitureAssembly: false,
    packingAssistance: false,
    packingMaterials: false,
    moveDate: "",
    preferredTime: null,
    dateFlexibility: null,
    budgetBand: null,
    customerComment: "",
    pendingPhotos: [],
  };
}


function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}


export function hydrateFromRequest(request: MoveRequestResponse): FormState {
  const version = request.currentVersion;
  const form = makeFormState();
  form.requestType = request.requestType;

  if (!version) {
    return form;
  }

  form.requestType = version.requestType;
  // Keep the immutable server snapshot independent of edits in this form.
  form.pickup = version.pickup ? { ...version.pickup } : makeLocation();
  form.destination = version.destination ? { ...version.destination } : makeLocation();
  form.apartmentRooms = version.apartmentMove?.numberOfRooms ?? null;
  form.smallBoxes = version.apartmentMove?.boxes.small ?? 0;
  form.mediumBoxes = version.apartmentMove?.boxes.medium ?? 0;
  form.largeBoxes = version.apartmentMove?.boxes.large ?? 0;
  form.furnitureDisassembly = version.apartmentMove?.additionalServices.furnitureDisassembly ?? false;
  form.furnitureAssembly = version.apartmentMove?.additionalServices.furnitureAssembly ?? false;
  form.packingAssistance = version.apartmentMove?.additionalServices.packingAssistance ?? false;
  form.packingMaterials = version.apartmentMove?.additionalServices.packingMaterials ?? false;
  form.moveDate = version.schedule.moveDate ?? "";
  form.preferredTime = version.schedule.preferredTime;
  form.dateFlexibility = version.schedule.dateFlexibility;
  form.budgetBand = version.budgetBand;
  form.customerComment = version.customerComment ?? "";

  form.apartmentInventory = (version.apartmentMove?.inventoryItems ?? []).map((item, index) => ({
    id: `${index}-${item.name ?? item.apartmentInventoryType ?? "inventory"}`,
    apartmentInventoryType: item.apartmentInventoryType ?? "Custom",
    name: item.name ?? "",
    description: item.description ?? "",
    quantity: item.quantity,
    lengthCm: item.lengthCm?.toString() ?? "",
    widthCm: item.widthCm?.toString() ?? "",
    heightCm: item.heightCm?.toString() ?? "",
    approximateWeightKg: item.approximateWeightKg?.toString() ?? "",
  }));

  form.smallMoveItems = version.smallMoveItems.map((item, index) => ({
    id: `${index}-${item.name ?? item.smallMoveCategory ?? "small"}`,
    smallMoveCategory: item.smallMoveCategory ?? "Other",
    name: item.name ?? "",
    description: item.description ?? "",
    quantity: item.quantity,
    lengthCm: item.lengthCm?.toString() ?? "",
    widthCm: item.widthCm?.toString() ?? "",
    heightCm: item.heightCm?.toString() ?? "",
    approximateWeightKg: item.approximateWeightKg?.toString() ?? "",
  }));

  form.specialItems = version.specialItems.map((item, index) => ({
    id: `${index}-${item.name ?? item.specialItemType ?? "special"}`,
    specialItemType: item.specialItemType ?? "Other",
    name: item.name ?? "",
    description: item.description ?? "",
    quantity: item.quantity,
    savedMeasurements: {
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      approximateWeightKg: item.approximateWeightKg,
    },
  }));

  return form;
}

// Pass the saved version for an existing request: server photo metadata has no
// editable representation in the form and must survive unrelated edits.
export function buildUpdatePayload(form: FormState, existingVersion?: MoveRequestResponse["currentVersion"]): UpdateMoveRequestRequest {
  const apartmentMove =
    form.requestType === "ApartmentMove"
      ? {
          numberOfRooms: form.apartmentRooms,
          boxes: {
            small: form.smallBoxes,
            medium: form.mediumBoxes,
            large: form.largeBoxes,
          },
          inventoryItems: form.apartmentInventory.map((item) => ({
            kind: APARTMENT_INVENTORY_KIND,
            apartmentInventoryType: item.apartmentInventoryType,
            specialItemType: null,
            smallMoveCategory: null,
            name: item.name || null,
            description: item.description || null,
            quantity: item.quantity,
            lengthCm: parseOptionalNumber(item.lengthCm),
            widthCm: parseOptionalNumber(item.widthCm),
            heightCm: parseOptionalNumber(item.heightCm),
            approximateWeightKg: parseOptionalNumber(item.approximateWeightKg),
          })),
          additionalServices: {
            furnitureDisassembly: form.furnitureDisassembly,
            furnitureAssembly: form.furnitureAssembly,
            packingAssistance: form.packingAssistance,
            packingMaterials: form.packingMaterials,
          },
        }
      : null;

  const smallMoveItems =
    form.requestType === "SmallMove"
      ? form.smallMoveItems.map((item) => ({
          kind: SMALL_MOVE_ITEM_KIND,
          apartmentInventoryType: null,
          specialItemType: null,
          smallMoveCategory: item.smallMoveCategory,
          name: item.name || null,
          description: item.description || null,
          quantity: item.quantity,
          lengthCm: parseOptionalNumber(item.lengthCm),
          widthCm: parseOptionalNumber(item.widthCm),
          heightCm: parseOptionalNumber(item.heightCm),
          approximateWeightKg: parseOptionalNumber(item.approximateWeightKg),
        }))
      : null;

  const specialItems = form.specialItems.map((item) => ({
    kind: SPECIAL_ITEM_KIND,
    apartmentInventoryType: null,
    specialItemType: item.specialItemType,
    smallMoveCategory: null,
    name: item.name || null,
    description: item.description || null,
    quantity: item.quantity,
    lengthCm: item.savedMeasurements?.lengthCm ?? null,
    widthCm: item.savedMeasurements?.widthCm ?? null,
    heightCm: item.savedMeasurements?.heightCm ?? null,
    approximateWeightKg: item.savedMeasurements?.approximateWeightKg ?? null,
  }));

  const pickup = locationPayload(form.pickup);
  const destination = locationPayload(form.destination);

  const schedule: MoveScheduleDto | null =
    form.moveDate || form.preferredTime || form.dateFlexibility
      ? {
          moveDate: form.moveDate || null,
          preferredTime: form.preferredTime,
          dateFlexibility: form.dateFlexibility,
        }
      : null;

  return {
    requestType: form.requestType ?? "ApartmentMove",
    pickup,
    destination,
    apartmentMove,
    smallMoveItems,
    specialItems,
    schedule,
    budgetBand: form.budgetBand,
    customerComment: form.customerComment.trim() || null,
    photos: existingVersion?.photos.map((photo) => ({ ...photo })) ?? [],
  };
}

function locationPayload(location: MoveLocationDto): MoveLocationDto | null {
  // Drafts may contain access details before the city/address is supplied.
  const supplied = location.city || location.exactAddress || location.stairsInfo || location.truckAccessInfo
    || location.floor !== null || location.hasElevator !== null || location.parkingDistanceMeters !== null
    || location.elevatorFurnitureSuitability !== "Unknown";
  return supplied ? { ...location } : null;
}
