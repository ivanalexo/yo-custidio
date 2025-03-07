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