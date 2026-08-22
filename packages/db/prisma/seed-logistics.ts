import type { PrismaClient, ShipmentMode } from '@prisma/client'

// Logistics reference seed (V3.3, ADR-0012).
//
// CURATED, not bulk-imported. The UN/LOCODE register runs to tens of thousands
// of entries; almost none of them are corridors Triyara ships. What is here is
// the actual trade lane: Indian origins, plus the destinations of the eleven
// markets the business already declares. A port that is missing is added as a
// ROW in this file - never as a schema change.
//
// Idempotent on the natural keys (`locode`, `code`), so re-running never
// duplicates and the CI seed-twice check sees row counts stand still.

type PortSeed = {
  locode: string
  name: string
  countryCode: string
  modes: ShipmentMode[]
}

const SEA: ShipmentMode[] = ['SEA_FCL', 'SEA_LCL']
const SEA_AND_ROAD: ShipmentMode[] = ['SEA_FCL', 'SEA_LCL', 'ROAD']
const AIR: ShipmentMode[] = ['AIR']

/**
 * Indian origins. Nhava Sheva and Mundra carry the bulk of container exports;
 * Kandla and Pipavav matter for the Gulf lanes; the southern ports serve the
 * spice and dehydrated-vegetable belt.
 */
const ORIGINS: PortSeed[] = [
  { locode: 'INNSA', name: 'Nhava Sheva (JNPT)', countryCode: 'IN', modes: SEA_AND_ROAD },
  { locode: 'INMUN', name: 'Mundra', countryCode: 'IN', modes: SEA_AND_ROAD },
  { locode: 'INIXY', name: 'Kandla (Deendayal)', countryCode: 'IN', modes: SEA },
  { locode: 'INPAV', name: 'Pipavav', countryCode: 'IN', modes: SEA },
  { locode: 'INMAA', name: 'Chennai', countryCode: 'IN', modes: SEA_AND_ROAD },
  { locode: 'INCOK', name: 'Cochin', countryCode: 'IN', modes: SEA },
  { locode: 'INVTZ', name: 'Visakhapatnam', countryCode: 'IN', modes: SEA },
  { locode: 'INBOM', name: 'Mumbai', countryCode: 'IN', modes: ['SEA_FCL', 'SEA_LCL', 'AIR'] },
  { locode: 'INDEL', name: 'Delhi (Indira Gandhi Intl)', countryCode: 'IN', modes: AIR },
]

/** One or two ports for each declared export market. */
const DESTINATIONS: PortSeed[] = [
  { locode: 'AEJEA', name: 'Jebel Ali', countryCode: 'AE', modes: SEA_AND_ROAD },
  { locode: 'AEDXB', name: 'Dubai', countryCode: 'AE', modes: ['SEA_FCL', 'SEA_LCL', 'AIR'] },
  { locode: 'SAJED', name: 'Jeddah', countryCode: 'SA', modes: SEA },
  { locode: 'SADMM', name: 'Dammam', countryCode: 'SA', modes: SEA },
  { locode: 'OMSOH', name: 'Sohar', countryCode: 'OM', modes: SEA },
  { locode: 'OMSLL', name: 'Salalah', countryCode: 'OM', modes: SEA },
  { locode: 'QADOH', name: 'Doha', countryCode: 'QA', modes: SEA },
  { locode: 'KWKWI', name: 'Kuwait', countryCode: 'KW', modes: SEA },
  { locode: 'USNYC', name: 'New York', countryCode: 'US', modes: SEA },
  { locode: 'USLAX', name: 'Los Angeles', countryCode: 'US', modes: SEA },
  { locode: 'CAMTR', name: 'Montreal', countryCode: 'CA', modes: SEA },
  { locode: 'CAVAN', name: 'Vancouver', countryCode: 'CA', modes: SEA },
  { locode: 'DEHAM', name: 'Hamburg', countryCode: 'DE', modes: SEA_AND_ROAD },
  { locode: 'GBFXT', name: 'Felixstowe', countryCode: 'GB', modes: SEA },
  { locode: 'SGSIN', name: 'Singapore', countryCode: 'SG', modes: SEA },
  { locode: 'AUSYD', name: 'Sydney', countryCode: 'AU', modes: SEA },
  { locode: 'AUMEL', name: 'Melbourne', countryCode: 'AU', modes: SEA },
]

type ContainerSeed = {
  code: string
  name: string
  teu: string
  maxPayloadKg: string | null
  internalVolumeCbm: string | null
}

/**
 * Nominal ISO figures. Real payload and volume vary by build and by carrier,
 * so these are a starting point a tenant can correct - not a guarantee. They
 * are strings because they land in Decimal columns; see @triyara/money for why
 * a JS number is never used for a stored decimal.
 *
 * There is deliberately NO "LCL" pseudo-container. SEA_LCL freight carries no
 * container type at all - the database CHECK refuses one - so a row here would
 * be exactly the fake container id ADR-0012 warned against.
 */
const CONTAINERS: ContainerSeed[] = [
  {
    code: '20GP',
    name: '20ft General Purpose',
    teu: '1.00',
    maxPayloadKg: '28200.00',
    internalVolumeCbm: '33.200',
  },
  {
    code: '40GP',
    name: '40ft General Purpose',
    teu: '2.00',
    maxPayloadKg: '26700.00',
    internalVolumeCbm: '67.700',
  },
  {
    code: '40HC',
    name: '40ft High Cube',
    teu: '2.00',
    maxPayloadKg: '26460.00',
    internalVolumeCbm: '76.400',
  },
  {
    code: '20RF',
    name: '20ft Reefer',
    teu: '1.00',
    maxPayloadKg: '27400.00',
    internalVolumeCbm: '28.300',
  },
  {
    code: '40RF',
    name: '40ft Reefer',
    teu: '2.00',
    maxPayloadKg: '27700.00',
    internalVolumeCbm: '59.300',
  },
]

export async function seedLogistics(prisma: PrismaClient) {
  for (const p of [...ORIGINS, ...DESTINATIONS]) {
    await prisma.port.upsert({
      where: { locode: p.locode },
      update: { name: p.name, countryCode: p.countryCode, modes: p.modes },
      create: p,
    })
  }

  for (const c of CONTAINERS) {
    await prisma.containerType.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        teu: c.teu,
        maxPayloadKg: c.maxPayloadKg,
        internalVolumeCbm: c.internalVolumeCbm,
      },
      create: c,
    })
  }

  return { ports: ORIGINS.length + DESTINATIONS.length, containerTypes: CONTAINERS.length }
}
