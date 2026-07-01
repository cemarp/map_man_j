import SwiftUI
import Charts

struct DashboardView: View {
    @ObservedObject var viewModel: AppViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let current = viewModel.currentMetrics {
                    CurrentStatsView(metrics: current)
                } else {
                    Text("Waiting for data...")
                        .padding()
                }

                Divider()

                BatteryControlView(viewModel: viewModel)

                Divider()

                if !viewModel.metricsHistory.isEmpty {
                    GraphsView(history: viewModel.metricsHistory)
                }
            }
            .padding()
        }
        .frame(minWidth: 600, minHeight: 500)
    }
}

struct CurrentStatsView: View {
    let metrics: SystemMetrics

    var body: some View {
        HStack(spacing: 40) {
            StatBox(title: "Total Power", value: String(format: "%.1f W", metrics.totalPower))
            StatBox(title: "CPU Temp", value: String(format: "%.1f °C", metrics.cpuTemp))
            StatBox(title: "Battery", value: String(format: "%.0f%%", metrics.batteryLevel))
            StatBox(title: "Cycles", value: "\(metrics.batteryCycles)")
        }
    }
}

struct StatBox: View {
    let title: String
    let value: String

    var body: some View {
        VStack {
            Text(title).font(.caption).foregroundColor(.secondary)
            Text(value).font(.title2).bold()
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }
}

struct BatteryControlView: View {
    @ObservedObject var viewModel: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Battery Controls").font(.headline)

            HStack {
                Text("Charge Limit: \(viewModel.batteryState.chargeLimit)%")
                Slider(value: Binding(
                    get: { Double(viewModel.batteryState.chargeLimit) },
                    set: { viewModel.batteryState.chargeLimit = Int($0) }
                ), in: 20...100, step: 1)
            }

            Toggle("Enable Sailing Mode", isOn: $viewModel.batteryState.sailingModeEnabled)

            if viewModel.batteryState.sailingModeEnabled {
                HStack {
                    Text("Sailing Lower Limit: \(viewModel.batteryState.sailingModeLowerLimit)%")
                    Slider(value: Binding(
                        get: { Double(viewModel.batteryState.sailingModeLowerLimit) },
                        set: { viewModel.batteryState.sailingModeLowerLimit = Int($0) }
                    ), in: 10...Double(viewModel.batteryState.chargeLimit - 1), step: 1)
                }
                .padding(.leading, 20)
            }

            Toggle("Force Discharge (Inhibit Charge)", isOn: $viewModel.batteryState.forceDischarge)
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(8)
    }
}

struct GraphsView: View {
    let history: [SystemMetrics]

    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            Text("Historical Data (RAM Buffer)").font(.headline)

            // Power Chart
            VStack(alignment: .leading) {
                Text("Power Consumption").font(.subheadline)
                Chart(history) { item in
                    LineMark(
                        x: .value("Time", item.timestamp),
                        y: .value("Total Power (W)", item.totalPower)
                    )
                    .foregroundStyle(.blue)

                    LineMark(
                        x: .value("Time", item.timestamp),
                        y: .value("CPU Power (W)", item.cpuPower)
                    )
                    .foregroundStyle(.red)
                }
                .frame(height: 200)
            }

            // Temperature Chart
            VStack(alignment: .leading) {
                Text("Temperatures").font(.subheadline)
                Chart(history) { item in
                    LineMark(
                        x: .value("Time", item.timestamp),
                        y: .value("CPU Temp (°C)", item.cpuTemp)
                    )
                    .foregroundStyle(.orange)

                    LineMark(
                        x: .value("Time", item.timestamp),
                        y: .value("Battery Temp (°C)", item.batteryTemp)
                    )
                    .foregroundStyle(.green)
                }
                .frame(height: 200)
            }
        }
    }
}
