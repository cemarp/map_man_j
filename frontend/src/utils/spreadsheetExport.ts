import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export async function handleSpreadsheetExport(appStateData: any) {
  const { state, computed } = appStateData;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Manual J Calculation');

  sheet.columns = [
    { header: 'Parameter', key: 'param', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
    { header: 'Unit / Notes', key: 'unit', width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  // Helper to add row and return its index
  const add = (p: string, v?: any, u?: string) => {
      const r = sheet.addRow({ param: p, value: v, unit: u });
      return r.number;
  };

  add('--- Environment ---');
  const rInSum = add('Indoor Summer Temp', state.indoorSummerTemp, '°F');
  const rOutSum = add('Outdoor Summer Temp', state.outdoorSummerTemp, '°F');
  add('Indoor Humidity', state.indoorHumidity, '%');
  add('Outdoor Humidity', state.outdoorHumidity, '%');
  const rInWin = add('Indoor Winter Temp', state.indoorWinterTemp, '°F');
  const rOutWin = add('Outdoor Winter Temp', state.outdoorWinterTemp, '°F');
  const rRes = add('Residents', state.residents, 'People');

  const rDtCool = add('DT Cooling', undefined, '°F difference');
  sheet.getCell(`B${rDtCool}`).value = { formula: `B${rOutSum} - B${rInSum}` };

  const rDtHeat = add('DT Heating', undefined, '°F difference');
  sheet.getCell(`B${rDtHeat}`).value = { formula: `B${rInWin} - B${rOutWin}` };
  add('');

  add('--- Geometry & Envelope ---');
  const rFloorArea = add('Total Floor Area', computed.totalArea, 'sq ft');
  const rHeight = add('House Height', state.houseHeight, 'ft');
  const rVolume = add('Total Volume', undefined, 'cu ft');
  sheet.getCell(`B${rVolume}`).value = { formula: `B${rFloorArea} * B${rHeight}` };

  const rGrossWall = add('Gross Wall Area', computed.wallArea, 'sq ft');
  const rRoof = add('Roof Area', computed.roofArea, 'sq ft');

  const rWallR = add('Wall R-Value', state.rValues.wall, 'R-Value');
  const rWallU = add('Wall U-Value', undefined, 'U-Value (1/R)');
  sheet.getCell(`B${rWallU}`).value = { formula: `IF(B${rWallR}>0, 1/B${rWallR}, 0)` };

  const rRoofR = add('Roof/Attic R-Value', state.attic.rValue || state.rValues.roof, 'R-Value');
  const rRoofU = add('Roof U-Value', undefined, 'U-Value (1/R)');
  sheet.getCell(`B${rRoofU}`).value = { formula: `IF(B${rRoofR}>0, 1/B${rRoofR}, 0)` };

  const rFoundR = add('Foundation R-Value', state.foundation.rValue, 'R-Value');
  const rFoundU = add('Foundation U-Value', undefined, 'U-Value (1/R)');
  sheet.getCell(`B${rFoundU}`).value = { formula: `IF(B${rFoundR}>0, 1/B${rFoundR}, 0.5)` };
  add('');

  // --- Windows ---
  add('--- Windows ---');
  let windowAreaFormulaParts: string[] = [];
  let windowCoolFormulaParts: string[] = [];
  let windowHeatFormulaParts: string[] = [];

  state.windows.forEach((w: any, index: number) => {
    const rW = add(`Window ${index + 1} Width`, w.width, 'ft');
    const rH = add(`Window ${index + 1} Height`, w.height, 'ft');
    const rU = add(`Window ${index + 1} U-Value`, w.uValue, '');
    const rS = add(`Window ${index + 1} SHGC`, w.shgc, '');

    const areaFormula = `B${rW}*B${rH}`;
    windowAreaFormulaParts.push(`(${areaFormula})`);
    windowCoolFormulaParts.push(`((${areaFormula})*B${rU}*B${rDtCool} + (${areaFormula})*B${rS}*45)`);
    windowHeatFormulaParts.push(`((${areaFormula})*B${rU}*B${rDtHeat})`);
  });
  if (windowAreaFormulaParts.length === 0) windowAreaFormulaParts = ['0'];
  if (windowCoolFormulaParts.length === 0) windowCoolFormulaParts = ['0'];
  if (windowHeatFormulaParts.length === 0) windowHeatFormulaParts = ['0'];
  add('');

  // --- Doors ---
  add('--- Doors ---');
  let doorAreaFormulaParts: string[] = [];
  let doorCoolFormulaParts: string[] = [];
  let doorHeatFormulaParts: string[] = [];

  state.doors.forEach((d: any, index: number) => {
    const rW = add(`Door ${index + 1} Width`, d.width, 'ft');
    const rH = add(`Door ${index + 1} Height`, d.height, 'ft');
    const rU = add(`Door ${index + 1} U-Value`, d.uValue, '');

    const areaFormula = `B${rW}*B${rH}`;
    doorAreaFormulaParts.push(`(${areaFormula})`);
    doorCoolFormulaParts.push(`((${areaFormula})*B${rU}*B${rDtCool})`);
    doorHeatFormulaParts.push(`((${areaFormula})*B${rU}*B${rDtHeat})`);
  });
  if (doorAreaFormulaParts.length === 0) doorAreaFormulaParts = ['0'];
  if (doorCoolFormulaParts.length === 0) doorCoolFormulaParts = ['0'];
  if (doorHeatFormulaParts.length === 0) doorHeatFormulaParts = ['0'];
  add('');

  // --- Skylights ---
  add('--- Skylights ---');
  let skylightAreaFormulaParts: string[] = [];
  let skylightCoolFormulaParts: string[] = [];
  let skylightHeatFormulaParts: string[] = [];

  state.skylights.forEach((s: any, index: number) => {
    const rW = add(`Skylight ${index + 1} Width`, s.width, 'ft');
    const rH = add(`Skylight ${index + 1} Height`, s.height, 'ft');
    const rU = add(`Skylight ${index + 1} U-Value`, s.uValue, '');
    const rS = add(`Skylight ${index + 1} SHGC`, s.shgc, '');

    const areaFormula = `B${rW}*B${rH}`;
    skylightAreaFormulaParts.push(`(${areaFormula})`);
    skylightCoolFormulaParts.push(`((${areaFormula})*B${rU}*B${rDtCool} + (${areaFormula})*B${rS}*70)`);
    skylightHeatFormulaParts.push(`((${areaFormula})*B${rU}*B${rDtHeat})`);
  });
  if (skylightAreaFormulaParts.length === 0) skylightAreaFormulaParts = ['0'];
  if (skylightCoolFormulaParts.length === 0) skylightCoolFormulaParts = ['0'];
  if (skylightHeatFormulaParts.length === 0) skylightHeatFormulaParts = ['0'];
  add('');

  // --- Loads ---
  const rSensibleHeader = add('--- Sensible Cooling Loads ---'); sheet.getRow(rSensibleHeader).font = { bold: true };

  const rWinArea = add('Total Window Area', undefined, 'sq ft');
  sheet.getCell(`B${rWinArea}`).value = { formula: windowAreaFormulaParts.join(' + ') };

  const rDoorArea = add('Total Door Area', undefined, 'sq ft');
  sheet.getCell(`B${rDoorArea}`).value = { formula: doorAreaFormulaParts.join(' + ') };

  const rSkyArea = add('Total Skylight Area', undefined, 'sq ft');
  sheet.getCell(`B${rSkyArea}`).value = { formula: skylightAreaFormulaParts.join(' + ') };

  const rNetWallArea = add('Net Wall Area', undefined, 'sq ft');
  sheet.getCell(`B${rNetWallArea}`).value = { formula: `MAX(0, B${rGrossWall} - B${rWinArea} - B${rDoorArea})` };

  const rNetRoofArea = add('Net Roof Area', undefined, 'sq ft');
  sheet.getCell(`B${rNetRoofArea}`).value = { formula: `MAX(0, B${rRoof} - B${rSkyArea})` };

  const rWallCool = add('Wall Sensible Cool', undefined, 'BTU/h');
  sheet.getCell(`B${rWallCool}`).value = { formula: `B${rNetWallArea} * B${rWallU} * B${rDtCool}` };

  const rRoofCool = add('Roof Sensible Cool', undefined, 'BTU/h');
  // Simple check: if vented add 20 to DT, else add 10
  const roofSolAirAdder = state.attic.type === 'Vented' ? 20 : 10;
  sheet.getCell(`B${rRoofCool}`).value = { formula: `B${rNetRoofArea} * B${rRoofU} * (B${rDtCool} + ${roofSolAirAdder})` };

  const rWinCool = add('Window Sensible Cool', undefined, 'BTU/h');
  sheet.getCell(`B${rWinCool}`).value = { formula: windowCoolFormulaParts.join(' + ') };

  const rDoorCool = add('Door Sensible Cool', undefined, 'BTU/h');
  sheet.getCell(`B${rDoorCool}`).value = { formula: doorCoolFormulaParts.join(' + ') };

  const rSkyCool = add('Skylight Sensible Cool', undefined, 'BTU/h');
  sheet.getCell(`B${rSkyCool}`).value = { formula: skylightCoolFormulaParts.join(' + ') };

  const rFoundCool = add('Foundation Sensible Cool', undefined, 'BTU/h');
  // Simplified foundation
  sheet.getCell(`B${rFoundCool}`).value = { formula: `B${rFloorArea} * B${rFoundU} * (B${rDtCool} * 0.5)` };

  const rInternalCool = add('Internal Sensible Cool', undefined, 'BTU/h');
  sheet.getCell(`B${rInternalCool}`).value = { formula: `B${rRes} * 230` };

  const rTotalSensibleCool = add('TOTAL SENSIBLE COOLING', undefined, 'BTU/h');
  sheet.getCell(`B${rTotalSensibleCool}`).value = {
    formula: `SUM(B${rWallCool}:B${rInternalCool})`
  };
  sheet.getRow(rTotalSensibleCool).font = { bold: true };

  add('');
  const rHeatingHeader = add('--- Heating Loads ---'); sheet.getRow(rHeatingHeader).font = { bold: true };
  const rWallHeat = add('Wall Heating', undefined, 'BTU/h');
  sheet.getCell(`B${rWallHeat}`).value = { formula: `B${rNetWallArea} * B${rWallU} * B${rDtHeat}` };

  const rRoofHeat = add('Roof Heating', undefined, 'BTU/h');
  sheet.getCell(`B${rRoofHeat}`).value = { formula: `B${rNetRoofArea} * B${rRoofU} * B${rDtHeat}` };

  const rWinHeat = add('Window Heating', undefined, 'BTU/h');
  sheet.getCell(`B${rWinHeat}`).value = { formula: windowHeatFormulaParts.join(' + ') };

  const rDoorHeat = add('Door Heating', undefined, 'BTU/h');
  sheet.getCell(`B${rDoorHeat}`).value = { formula: doorHeatFormulaParts.join(' + ') };

  const rSkyHeat = add('Skylight Heating', undefined, 'BTU/h');
  sheet.getCell(`B${rSkyHeat}`).value = { formula: skylightHeatFormulaParts.join(' + ') };

  const rFoundHeat = add('Foundation Heating', undefined, 'BTU/h');
  sheet.getCell(`B${rFoundHeat}`).value = { formula: `B${rFloorArea} * B${rFoundU} * (B${rDtHeat} * 0.5)` };

  const rTotalHeat = add('TOTAL HEATING', undefined, 'BTU/h');
  sheet.getCell(`B${rTotalHeat}`).value = {
    formula: `SUM(B${rWallHeat}:B${rFoundHeat})`
  };
  sheet.getRow(rTotalHeat).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), 'manual_j_calculation.xlsx');
}

export async function handleSpreadsheetImport(file: File, currentState: any): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  const sheet = workbook.getWorksheet('Manual J Calculation');
  if (!sheet) {
    throw new Error('Invalid spreadsheet format: Missing "Manual J Calculation" sheet');
  }

  // Clone current state to avoid mutating it directly before it's ready
  const newState = JSON.parse(JSON.stringify(currentState));

  // Helper to find a row by parameter name and extract its value
  const getValue = (paramName: string, defaultValue: any = null) => {
    let result = defaultValue;
    sheet.eachRow((row) => {
      const paramCell = row.getCell(1).value;
      if (paramCell && paramCell.toString() === paramName) {
        const valCell = row.getCell(2);
        // If the cell contains a formula, get its calculated result (or fallback to value)
        if (valCell.type === ExcelJS.ValueType.Formula) {
            result = (valCell.value as any)?.result ?? defaultValue;
        } else {
            result = valCell.value ?? defaultValue;
        }
      }
    });
    return result;
  };

  // Update environment
  newState.indoorSummerTemp = Number(getValue('Indoor Summer Temp', newState.indoorSummerTemp));
  newState.outdoorSummerTemp = Number(getValue('Outdoor Summer Temp', newState.outdoorSummerTemp));
  newState.indoorHumidity = Number(getValue('Indoor Humidity', newState.indoorHumidity));
  newState.outdoorHumidity = Number(getValue('Outdoor Humidity', newState.outdoorHumidity));
  newState.indoorWinterTemp = Number(getValue('Indoor Winter Temp', newState.indoorWinterTemp));
  newState.outdoorWinterTemp = Number(getValue('Outdoor Winter Temp', newState.outdoorWinterTemp));
  newState.residents = Number(getValue('Residents', newState.residents));

  // Update geometries & R-values
  newState.houseHeight = Number(getValue('House Height', newState.houseHeight));
  newState.rValues.wall = Number(getValue('Wall R-Value', newState.rValues.wall));

  const newRoofR = Number(getValue('Roof/Attic R-Value', null));
  if (newRoofR !== null && !isNaN(newRoofR)) {
     newState.attic.rValue = newRoofR;
     newState.rValues.roof = newRoofR;
  }

  const newFoundR = Number(getValue('Foundation R-Value', null));
  if (newFoundR !== null && !isNaN(newFoundR)) {
     newState.foundation.rValue = newFoundR;
  }


  // Helper to extract dynamic lists (windows, doors, skylights)
  const extractList = (prefix: string, props: string[], createFn: (extractedProps: any) => any) => {
    let list: any[] = [];
    let index = 1;
    while (true) {
        // Look for the first property to see if the item exists
        let exists = false;
        sheet.eachRow((row) => {
            const paramCell = row.getCell(1).value;
            if (paramCell && paramCell.toString() === `${prefix} ${index} ${props[0]}`) exists = true;
        });
        if (!exists) break;

        const extractedProps: any = {};
        props.forEach(prop => {
            extractedProps[prop] = Number(getValue(`${prefix} ${index} ${prop}`, 0));
        });
        list.push(createFn(extractedProps));
        index++;
    }
    return list;
  };

  // Update dynamic lists
  const newWindows = extractList('Window', ['Width', 'Height', 'U-Value', 'SHGC'], (p) => ({
      id: Math.random().toString(36).substring(7),
      width: p['Width'], height: p['Height'], uValue: p['U-Value'], shgc: p['SHGC'], description: 'Imported', orientation: 'N'
  }));
  if (newWindows.length > 0) newState.windows = newWindows;

  const newDoors = extractList('Door', ['Width', 'Height', 'U-Value'], (p) => ({
      id: Math.random().toString(36).substring(7),
      width: p['Width'], height: p['Height'], uValue: p['U-Value'], description: 'Imported'
  }));
  if (newDoors.length > 0) newState.doors = newDoors;

  const newSkylights = extractList('Skylight', ['Width', 'Height', 'U-Value', 'SHGC'], (p) => ({
      id: Math.random().toString(36).substring(7),
      width: p['Width'], height: p['Height'], uValue: p['U-Value'], shgc: p['SHGC'], description: 'Imported'
  }));
  if (newSkylights.length > 0) newState.skylights = newSkylights;

  return newState;
}
