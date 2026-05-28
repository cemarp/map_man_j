from climate import get_climate_data, get_property_defaults

lat, lng = 37.2970351, -121.8873522 # San Jose
print(get_climate_data(lat, lng))
print(get_property_defaults(lat, lng))
