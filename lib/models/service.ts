import * as t from "io-ts";
import { PathReporter } from "io-ts/lib/PathReporter";

import * as DocumentDb from "documentdb";
import * as DocumentDbUtils from "../utils/documentdb";
import {
  DocumentDbModelVersioned,
  ModelId,
  VersionedModel
} from "../utils/documentdb_model_versioned";

import { Either } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";

import { Set } from "json-set-map";

import { CIDR } from "../api/definitions/CIDR";
import { FiscalCode } from "../api/definitions/FiscalCode";

import { NonNegativeNumber } from "italia-ts-commons/lib/numbers";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { nonEmptyStringToModelId } from "../utils/conversions";

import { pick, readonlySetType, tag } from "italia-ts-commons/lib/types";

export const SERVICE_COLLECTION_NAME = "services";
export const SERVICE_MODEL_PK_FIELD = "serviceId";

/**
 * Base interface for Service objects
 */
export const Service = t.interface({
  // authorized source CIDRs
  authorizedCIDRs: readonlySetType(CIDR, "CIDRs"),
  // list of authorized fiscal codes
  authorizedRecipients: readonlySetType(FiscalCode, "fiscal codes"),
  // the name of the department within the service
  departmentName: NonEmptyString,
  // fiscal code of the organization, used to receive payments
  organizationFiscalCode: FiscalCode,
  // the name of the organization
  organizationName: NonEmptyString,
  // this equals user's subscriptionId
  serviceId: NonEmptyString,
  // the name of the service
  serviceName: NonEmptyString
});

export type Service = t.TypeOf<typeof Service>;

/**
 * Interface for new Service objects
 */

interface INewServiceTag {
  readonly kind: "INewService";
}

export const NewService = tag<INewServiceTag>()(
  t.intersection([Service, DocumentDbUtils.NewDocument, VersionedModel])
);

export type NewService = t.TypeOf<typeof NewService>;

/**
 * Interface for retrieved Service objects
 *
 * Existing Service records have a version number.
 */
interface IRetrievedServiceTag {
  readonly kind: "IRetrievedService";
}

export const RetrievedService = tag<IRetrievedServiceTag>()(
  t.intersection([Service, DocumentDbUtils.RetrievedDocument, VersionedModel])
);

export type RetrievedService = t.TypeOf<typeof RetrievedService>;

/**
 * Converts an Array or a Set of strings to a ReadonlySet of fiscalCodes.
 *
 * We need to handle Arrays as this method is called by database finders
 * who retrieve a plain json object.
 *
 * We need to handle Sets as this method is called on Service objects
 * passed to create(Service) and update(Service) model methods.
 *
 * @param authorizedRecipients  Array or Set of authorized fiscal codes
 *                              for this service.
 *
 * @deprecated Use the Service validation to do the conversion.
 */
export function toAuthorizedRecipients(
  authorizedRecipients: ReadonlyArray<string> | ReadonlySet<string> | undefined
): ReadonlySet<FiscalCode> {
  return new Set(Array.from(authorizedRecipients || []).filter(FiscalCode.is));
}

/**
 * @see toAuthorizedRecipients
 * @param authorizedCIDRs   Array or Set of authorized CIDRs for this service.
 *
 * @deprecated Use the Service validation to do the conversion.
 */
export function toAuthorizedCIDRs(
  authorizedCIDRs: ReadonlyArray<string> | ReadonlySet<string> | undefined
): ReadonlySet<CIDR> {
  return new Set(Array.from(authorizedCIDRs || []).filter(CIDR.is));
}

function toRetrieved(result: DocumentDb.RetrievedDocument): RetrievedService {
  const validation = RetrievedService.decode(result);
  return validation.getOrElseL(_ => {
    throw new Error(PathReporter.report(validation).join("\n"));
  });
}

function getModelId(o: Service): ModelId {
  return nonEmptyStringToModelId(o.serviceId);
}

function updateModelId(
  o: Service,
  id: NonEmptyString,
  version: NonNegativeNumber
): NewService {
  return {
    ...o,
    id,
    kind: "INewService",
    version
  };
}

function toBaseType(o: RetrievedService): Service {
  return pick(
    [
      "authorizedCIDRs",
      "authorizedRecipients",
      "departmentName",
      "organizationFiscalCode",
      "organizationName",
      "serviceId",
      "serviceName"
    ],
    o
  );
}

/**
 * A model for handling Services
 */
export class ServiceModel extends DocumentDbModelVersioned<
  Service,
  NewService,
  RetrievedService
> {
  /**
   * Creates a new Service model
   *
   * @param dbClient the DocumentDB client
   * @param collectionUrl the collection URL
   */
  constructor(
    dbClient: DocumentDb.DocumentClient,
    collectionUrl: DocumentDbUtils.IDocumentDbCollectionUri
  ) {
    super(
      dbClient,
      collectionUrl,
      toBaseType,
      toRetrieved,
      getModelId,
      updateModelId
    );
  }

  public findOneByServiceId(
    serviceId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, Option<RetrievedService>>> {
    return super.findLastVersionByModelId(
      SERVICE_MODEL_PK_FIELD,
      serviceId,
      SERVICE_MODEL_PK_FIELD,
      serviceId
    );
  }
}
