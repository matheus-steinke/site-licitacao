-- "rtu" (ressecção transuretral) casava com "Modbus RTU" em itens de eletrônica: uma licitação
-- de engenharia aparecia como Urologia. Siglas curtas com outro sentido fora da saúde saem.
update public.segmentos set sinonimos = array_remove(sinonimos, 'rtu') where slug = 'urologia';
