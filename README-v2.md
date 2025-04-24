## Inciar proyecto

ir al directorio de `/docker` y ejecutar el commando

```bash
$ docker-compose up
```

eso levantará las instancias de `MongoDB`, `RabbitMQ`, `NestJs`, `Redis`, y el backend de procesamiento de imagen.

Para detener los contenedores, se puede hacer desde Docker Desktop o ejecutando en el directorio `/docker`

```bash
$ docker-compose stop
```

## Swagger

la documentación de los endpoints se encuentra en Swagger, se puede acceder a ella accediendo a la ruta:
`http://localhost:3000/api/docs`

## Seed Data

para tener datos populados en la DB de mongo se crearon los siguientes scripts para llenar todas la colecciones: `actas`, `recintos` y `partidos`:

### Para llenar todas la colecciones

```bash
$ npm run seed
```

### Para llenar solo la colección de partidos:

```bash
$ npm run seed:parties
```

### Para llenar solo la colección de recintos:

```bash
$ npm run seed:locations
```

### Para llenar solo la colección de actas:

```bash
$ npm run seed:ballots
```

_Nota: esta populación de datos solo es para fines de testing_
