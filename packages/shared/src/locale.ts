// Countries SiteFlow is set up for. A company picks its country at sign-up; that sets its currency,
// time zone, phone format and the places used in the sample projects. Everything that shows money,
// dates or phone numbers follows it, on the web, on the phone and in the messages sent by the server.
//
// perUSD: rough units of the currency per US dollar, used only to scale the sample projects so their
// money looks right in each country (never for real conversions).

export interface Country {
  code: string; name: string; currency: string; symbol: string; timeZone: string; dial: string;
  phoneExample: string; perUSD: number; cities: [string, string, string];
}

export const COUNTRIES: Country[] = [
  { code: 'GH', name: 'Ghana', currency: 'GHS', symbol: 'GH₵', timeZone: 'Africa/Accra', dial: '233', phoneExample: '024 000 0000', perUSD: 11, cities: ['Adenta, Accra', 'East Legon, Accra', 'Kasoa, Central Region'] },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', symbol: '₦', timeZone: 'Africa/Lagos', dial: '234', phoneExample: '0803 000 0000', perUSD: 1500, cities: ['Lekki, Lagos', 'Wuse II, Abuja', 'Ikorodu, Lagos'] },
  { code: 'KE', name: 'Kenya', currency: 'KES', symbol: 'KSh', timeZone: 'Africa/Nairobi', dial: '254', phoneExample: '0712 000 000', perUSD: 129, cities: ['Karen, Nairobi', 'Westlands, Nairobi', 'Athi River, Machakos'] },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R', timeZone: 'Africa/Johannesburg', dial: '27', phoneExample: '082 000 0000', perUSD: 18, cities: ['Midrand, Johannesburg', 'Sandton, Johannesburg', 'Bellville, Cape Town'] },
  { code: 'UG', name: 'Uganda', currency: 'UGX', symbol: 'USh', timeZone: 'Africa/Kampala', dial: '256', phoneExample: '0772 000 000', perUSD: 3700, cities: ['Kira, Wakiso', 'Kololo, Kampala', 'Mukono'] },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', symbol: 'TSh', timeZone: 'Africa/Dar_es_Salaam', dial: '255', phoneExample: '0754 000 000', perUSD: 2600, cities: ['Mbezi, Dar es Salaam', 'Masaki, Dar es Salaam', 'Kibaha, Pwani'] },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', symbol: 'FRw', timeZone: 'Africa/Kigali', dial: '250', phoneExample: '0788 000 000', perUSD: 1400, cities: ['Kibagabaga, Kigali', 'Kacyiru, Kigali', 'Bugesera'] },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB', symbol: 'Br', timeZone: 'Africa/Addis_Ababa', dial: '251', phoneExample: '0911 000 000', perUSD: 120, cities: ['Bole, Addis Ababa', 'Kazanchis, Addis Ababa', 'Adama'] },
  { code: 'ZM', name: 'Zambia', currency: 'ZMW', symbol: 'K', timeZone: 'Africa/Lusaka', dial: '260', phoneExample: '0977 000 000', perUSD: 26, cities: ['Ibex Hill, Lusaka', 'Rhodes Park, Lusaka', 'Kafue'] },
  { code: 'BW', name: 'Botswana', currency: 'BWP', symbol: 'P', timeZone: 'Africa/Gaborone', dial: '267', phoneExample: '71 000 000', perUSD: 13.5, cities: ['Phakalane, Gaborone', 'CBD, Gaborone', 'Mogoditshane'] },
  { code: 'NA', name: 'Namibia', currency: 'NAD', symbol: 'N$', timeZone: 'Africa/Windhoek', dial: '264', phoneExample: '081 000 0000', perUSD: 18, cities: ['Klein Windhoek', 'Windhoek CBD', 'Okahandja'] },
  { code: 'MW', name: 'Malawi', currency: 'MWK', symbol: 'MK', timeZone: 'Africa/Blantyre', dial: '265', phoneExample: '0888 000 000', perUSD: 1750, cities: ['Area 43, Lilongwe', 'City Centre, Lilongwe', 'Limbe, Blantyre'] },
  { code: 'SL', name: 'Sierra Leone', currency: 'SLE', symbol: 'Le', timeZone: 'Africa/Freetown', dial: '232', phoneExample: '076 000 000', perUSD: 23, cities: ['Hill Station, Freetown', 'Aberdeen, Freetown', 'Waterloo'] },
  { code: 'LR', name: 'Liberia', currency: 'LRD', symbol: 'L$', timeZone: 'Africa/Monrovia', dial: '231', phoneExample: '077 000 0000', perUSD: 190, cities: ['Sinkor, Monrovia', 'Congo Town, Monrovia', 'Paynesville'] },
  { code: 'GM', name: 'The Gambia', currency: 'GMD', symbol: 'D', timeZone: 'Africa/Banjul', dial: '220', phoneExample: '700 0000', perUSD: 70, cities: ['Brusubi', 'Kololi', 'Brikama'] },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', symbol: 'CFA', timeZone: 'Africa/Abidjan', dial: '225', phoneExample: '07 00 00 00 00', perUSD: 600, cities: ['Cocody, Abidjan', 'Plateau, Abidjan', 'Bingerville'] },
  { code: 'SN', name: 'Senegal', currency: 'XOF', symbol: 'CFA', timeZone: 'Africa/Dakar', dial: '221', phoneExample: '77 000 00 00', perUSD: 600, cities: ['Almadies, Dakar', 'Plateau, Dakar', 'Diamniadio'] },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', symbol: 'FCFA', timeZone: 'Africa/Douala', dial: '237', phoneExample: '6 70 00 00 00', perUSD: 600, cities: ['Bonapriso, Douala', 'Bastos, Yaoundé', 'Bonaberi, Douala'] },
  { code: 'EG', name: 'Egypt', currency: 'EGP', symbol: 'E£', timeZone: 'Africa/Cairo', dial: '20', phoneExample: '010 0000 0000', perUSD: 48, cities: ['New Cairo', 'Sheikh Zayed, Giza', '6th of October City'] },
  { code: 'MA', name: 'Morocco', currency: 'MAD', symbol: 'MAD', timeZone: 'Africa/Casablanca', dial: '212', phoneExample: '06 00 00 00 00', perUSD: 9.5, cities: ['Bouskoura, Casablanca', 'Agdal, Rabat', 'Tangier'] },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', timeZone: 'Asia/Dubai', dial: '971', phoneExample: '050 000 0000', perUSD: 3.67, cities: ['Dubai Hills, Dubai', 'Business Bay, Dubai', 'Al Reem, Abu Dhabi'] },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', symbol: 'SAR', timeZone: 'Asia/Riyadh', dial: '966', phoneExample: '050 000 0000', perUSD: 3.75, cities: ['Al Malqa, Riyadh', 'King Abdullah Financial District, Riyadh', 'Obhur, Jeddah'] },
  { code: 'IN', name: 'India', currency: 'INR', symbol: '₹', timeZone: 'Asia/Kolkata', dial: '91', phoneExample: '098765 43210', perUSD: 85, cities: ['Whitefield, Bengaluru', 'BKC, Mumbai', 'Gachibowli, Hyderabad'] },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', symbol: 'Rs', timeZone: 'Asia/Karachi', dial: '92', phoneExample: '0300 0000000', perUSD: 280, cities: ['DHA, Lahore', 'Blue Area, Islamabad', 'Gulshan, Karachi'] },
  { code: 'PH', name: 'Philippines', currency: 'PHP', symbol: '₱', timeZone: 'Asia/Manila', dial: '63', phoneExample: '0917 000 0000', perUSD: 58, cities: ['Alabang, Muntinlupa', 'BGC, Taguig', 'Cebu City'] },
  { code: 'JM', name: 'Jamaica', currency: 'JMD', symbol: 'J$', timeZone: 'America/Jamaica', dial: '1', phoneExample: '(876) 000 0000', perUSD: 158, cities: ['Constant Spring, Kingston', 'New Kingston', 'Portmore'] },
  { code: 'TT', name: 'Trinidad and Tobago', currency: 'TTD', symbol: 'TT$', timeZone: 'America/Port_of_Spain', dial: '1', phoneExample: '(868) 000 0000', perUSD: 6.8, cities: ['Westmoorings', 'Port of Spain', 'Chaguanas'] },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', timeZone: 'Europe/London', dial: '44', phoneExample: '07700 900000', perUSD: 0.78, cities: ['Croydon, London', 'Canary Wharf, London', 'Salford, Manchester'] },
  { code: 'IE', name: 'Ireland', currency: 'EUR', symbol: '€', timeZone: 'Europe/Dublin', dial: '353', phoneExample: '085 000 0000', perUSD: 0.92, cities: ['Sandyford, Dublin', 'Docklands, Dublin', 'Ballincollig, Cork'] },
  { code: 'US', name: 'United States', currency: 'USD', symbol: '$', timeZone: 'America/New_York', dial: '1', phoneExample: '(555) 000 0000', perUSD: 1, cities: ['Arlington, Virginia', 'Midtown, Atlanta', 'Katy, Texas'] },
  { code: 'CA', name: 'Canada', currency: 'CAD', symbol: 'CA$', timeZone: 'America/Toronto', dial: '1', phoneExample: '(416) 000 0000', perUSD: 1.37, cities: ['Brampton, Ontario', 'Downtown Toronto', 'Surrey, British Columbia'] },
  { code: 'AU', name: 'Australia', currency: 'AUD', symbol: 'A$', timeZone: 'Australia/Sydney', dial: '61', phoneExample: '0412 000 000', perUSD: 1.52, cities: ['Parramatta, Sydney', 'Southbank, Melbourne', 'Logan, Brisbane'] },
];

export const DEFAULT_COUNTRY = 'GH';
export const countryOf = (code?: string | null): Country => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
export const isCountry = (code: unknown) => typeof code === 'string' && COUNTRIES.some((c) => c.code === code);

// A company's settings, with Ghana for companies created before countries existed
export function companyLocale(company?: { country?: string; currency?: string; timeZone?: string } | null) {
  const c = countryOf(company?.country);
  return { country: c.code, currency: company?.currency || c.currency, symbol: symbolOf(company?.currency || c.currency), timeZone: company?.timeZone || c.timeZone, dial: c.dial, phoneExample: c.phoneExample, cities: c.cities };
}
export const symbolOf = (currency: string) => COUNTRIES.find((c) => c.currency === currency)?.symbol ?? currency;

// A best guess at the visitor's country from the device's time zone (sign-up form default)
export function guessCountry(timeZone?: string) {
  try { timeZone ||= Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* old browsers */ }
  return COUNTRIES.find((c) => c.timeZone === timeZone)?.code ?? DEFAULT_COUNTRY;
}

import { setTimeZone } from './dates';

// ---- The current company's settings, for the apps (one company per signed-in person) ----
// The server never uses these defaults: it passes each company's settings explicitly.
let current = companyLocale(null);
export const setLocale = (company?: Parameters<typeof companyLocale>[0]) => { current = companyLocale(company); setTimeZone(company ? current.timeZone : undefined); return current; };
export const getLocale = () => current;
export const currencySymbol = () => current.symbol;
